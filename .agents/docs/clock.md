# The Clock — Injected Time & the Deterministic Test Mode

> Records why time is an injected dependency of the runtime, the `Clock` contract, the
> `VirtualClock.advance()` semantics (the one genuinely subtle design here), the exact
> boundary of what is and is not virtualized, and the deliberate decision to keep all of
> this **internal-only** for now. Everything here is AI-accumulated design rationale from
> the 2026-07-10 session that introduced the clock; challenge and verify freely.

## Why

The runtime used to read time from process globals (`Date.now`, `performance.now`, global
`setTimeout`) at five sites. Every test that touched timing therefore depended on the wall
clock, which produced a measured, recurring tax: ~30ms of mandatory real sleep per
`stdin.write` in the public harness, `vi.useFakeTimers` (a process-global mutation) forcing
timing tests into `*.sequential.test.*` files with fragile narrow `toFake` configs, and
in-file test concurrency disabled suite-wide because commit-throttle assertions depended on
real elapsed time — the classic "passes on a fast dev machine, starves on a 4-core CI
runner" trap documented in AGENTS.md.

The fix: **time is a constructor dependency, like stdout.** Production injects a
passthrough to the real timers (identical behavior, same throttle logic — only the clock
source is swapped; see the non-divergence note in
[ink-divergences.md](./ink-divergences.md)). The runtime's own tests inject a
`VirtualClock`: a ledger of pending timers plus an `advance(ms)` that plays the future
deterministically. Wall time then has no causal path into test output — flakiness of this
class is not made rarer, it is made structurally impossible.

This is scope-correct fake timers, not interception: no global is ever patched. Two
concurrently running tests each advance their own app's clock and physically cannot
interfere, which is what lets migrated files leave the `*.sequential.test.*` set.

## The `Clock` contract

```ts
interface Clock {
  now(): number; // monotonic milliseconds
  setTimeout(cb: () => void, ms: number): ClockTimeout;
  clearTimeout(handle: ClockTimeout): void;
}
```

- **One time base.** The commit scheduler historically read `Date.now` and the animation
  scheduler `performance.now`; both consume only _deltas_, so a single monotonic timeline
  serves both. `VirtualClock` starts at 0.
- **`realClock` forwards lazily** — `now: () => performance.now()`, never a captured
  reference. A bare `performance.now` reference throws when called (loses its `this`), and
  a module-load-captured `setTimeout` would bypass `vi.useFakeTimers` in tests that still
  fake globals and rely on the runtime reading them at fire time.
- **Consumers call `clock.setTimeout(...)` via property access at fire time** — never
  destructured or captured at construction — so tests can `vi.spyOn(clock, "setTimeout")`
  and observe scheduling.
- The clock reaches the runtime through an internal Symbol-keyed mount option
  (`INTERNAL_CLOCK`, same pattern as `INTERNAL_FRAME_SINK`) and is carried on
  `AppContext.clock`. It is deliberately absent from the public `MountOptions` type.

## `VirtualClock.advance(ms)` semantics

`clock.setTimeout` under a `VirtualClock` starts nothing; it appends `{at, seq, cb}` to a
ledger (`seq` is an insertion counter). `advance(ms)` is a small interpreter that plays the
recorded future:

1. Loop: find the earliest due entry ≤ target, **re-querying the live ledger every
   iteration**. A firing callback may register a same-instant timer (`setTimeout(fn, 0)`);
   Node semantics require it to fire within this `advance`, so a snapshot taken up front
   would be wrong. (PocketJS's clock avoids this with a min-one-frame clamp on new timers;
   we run existing code with Node timer semantics and cannot impose that.)
2. Set virtual now to that entry's due time, then fire its callback — "time reaches t"
   happens before anything scheduled at t observes t.
3. **After every fire, drain to quiescence**: await a real `setImmediate` barrier. By
   event-loop ordering, when that barrier runs, all microtasks and `process.nextTick`
   callbacks — Vue's reactivity flush, stream write callbacks — have landed. This
   replicates the invariant that between two real timer callbacks the microtask queue
   always drains; skipping it would hand later timers a world state that cannot occur in
   production.
4. Same-due-time ordering: `(at, seq)` ascending — first registered fires first, matching
   Node.
5. Runaway guard: a hard cap on fires per `advance` call; on breach, throw an error naming
   the offending timer (a `0ms` self-rescheduling callback would otherwise spin forever at
   one virtual instant).
6. **Throw semantics**: a throwing callback rejects `advance()`. Post-throw state is
   defined: virtual now rests at the throwing timer's due time, the ledger keeps all
   remaining (and newly added) timers, and the clock is not wedged — a later `advance`
   fires them. Timer-owner recovery (e.g. the animation scheduler's own try/finally) is the
   owner's job, not the clock's.
7. When no due entries remain, set now to the target and resolve.

### What `advance()` does NOT settle

Chains routed through the runtime's **own** `setImmediate`/write-barrier steps — exit
teardown (`resolveExit`) and `waitUntilRenderFlush` — complete one check-phase turn _after_
an `advance()` barrier. Tests must await the promises those APIs surface
(`waitUntilExit()`, `waitUntilRenderFlush()`); never rely on `advance()` alone to observe
exit or flush completion.

## The boundary: three categories

| Category                                                                                                                               | Treatment                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| The runtime's own timers (commit-throttle trailing window, animation scheduler ticks, stdin escape pending-flush, kitty query timeout) | Virtual — they go through `AppContext.clock`                                  |
| Ordering primitives: microtasks, `nextTick`, `setImmediate`, stream internals                                                          | Real, untouched — they encode _order_, not time; `advance()` only awaits them |
| Timers in user/app component code (global `setTimeout` etc.)                                                                           | Out of scope — they live on the wall clock and `advance()` does not move them |

Deliberately left on the real clock:

- `hmr.ts`'s reset timer — module-global, dev-only; a per-app clock has no handle to it.
- The three `setImmediate` sites in `render.ts` (exit-drain finish, `waitUntilRenderFlush`
  yields) — event-loop yields, not time.
- `useAnimation`'s provider-missing fallback (`createAnimationScheduler()` standalone,
  outside any app) — there is no app context to source a clock from.
- The PTY and examples test suites — real subprocesses, real time by nature.

## Internal-only status

The clock is **not public API**. `VirtualClock` and `INTERNAL_CLOCK` are exported only via
`@vue-tui/runtime/internal` for vue-tui's own tests; the public `@vue-tui/testing`
`render()` keeps the real clock (a virtual default with no `advance` handle would freeze
user animations).

Rationale: the measured value is internal (the suite's own flakiness tax); publishing turns
`advance()` semantics and the three-category boundary into semver contracts before internal
use has hardened them; and a public version has a landmine the internal one lint-guards
away — user components calling global `setTimeout` silently don't move with `advance()`.
Revisit exposure when (a) internal usage has hardened the semantics, (b) a
`useTimeout`-style composable exists so user code can join the virtual world, and (c) a
real demand signal appears (e.g. agent-driven app iteration wanting deterministic frame
assertions).

## The chaos watchdog

The determinism claim has its own resident regression test: one scripted journey run twice,
the second run injecting random real sleeps and allocation churn between `advance()` steps;
the captured content-write sequences must be byte-identical. If any code path regains a
wall-clock dependency, the injected jitter eventually pushes some decision across a
threshold and the test fails — it is a leak detector, not a one-time proof.
