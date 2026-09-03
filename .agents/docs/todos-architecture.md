# TODOs — architecture

The work that moves `@vue-tui/runtime` from its current internal structure to the one in [Runtime architecture](./architecture.md). Each task states where the code stands today, the steps that get it there, what "done" means, how to check it, and what to watch for.

**This file deletes itself.** It exists only to hold the gap between the record and the code. When every task below has landed, delete this file and remove its route from [the records map](./README.md); nothing here needs to be preserved, because the architecture record already states the target and git keeps the history. Do not add ordinary follow-up work here — that belongs in [TODOs](./todos.md).

Counts below were measured at `b21674e`; task-specific line numbers state which prerequisite tree they reflect. Re-measure before relying on any of them.

## Order

```text
1 rename ──▶ 2 move ──┬──▶ 3 layout ──┐
                      ├──▶ 4 surfaces ┴──▶ 6 frame ──▶ 7 session ──▶ 9 lifecycle
                      │                  4 surfaces + 5 terminal ──▶ 8 mode leases
                      └──▶ 5 terminal ─────────────────┘
```

Tasks 3, 4 and 5 are independent of each other and can land in any order once 2 has, with one caveat: task 4 gives `FullscreenSurface` alternate-screen and cursor ownership before task 8 centralizes the bytes behind task 5's lease. Task 6 needs the geometry from 3 and the per-surface previous frame from 4. Task 7 needs tasks 3 through 6 because each carries a responsibility out of the mount closure. Task 8 then replaces every per-mode write path, and task 9 replaces the remaining suspend, resume and teardown booleans.

Every step inside a task is meant to land on its own and leave the suite green. A step that cannot is written as one step.

## What none of this changes

- **The public surface.** `packages/runtime/src/api/index.ts` exports `createApp`, `renderToString`, `Box`, `Text`, the six composables and their types. No task below adds, removes or renames anything there.
- **Accepted behaviour.** [Runtime API decisions](./runtime-api-decisions.md) and [Rendering modes](./rendering-modes.md) govern what the code does; these tasks change how it is arranged. Where a task must emit different bytes to reach the same screen, it says so.
- **The observation channels.** `@vue-tui/testing`'s structured content frames and xterm screen snapshots are [Rendering modes](./rendering-modes.md#deterministic-and-string-hosts)' subject, not this record's.

## 1. Rename the input path

`InputSequence` (`input/input-parser.ts`) names the complete raw piece, `InputEvent` (`input/normalized-input.ts`) the structured fact, and `InputDispatcher` (`input/input-subscriptions.ts`) owns subscriber capture and delivery. `InputParser` holds partial decoded terminal sequences; task 5 moves byte decoding from the shared stdin ingress under `input/`.

## 2. Move the directories

`runtime/src` is `api/ dev/ vue/ session/ input/ surface/ terminal/ paint/ layout/ text/ host/`, with `render.ts`, `render-to-string.ts`, `render-session.ts`, `color-profile.ts` and `env.d.ts` still at the top level: the render files dissolve in tasks 3 through 7, and the colour and style files follow task 6, which creates `frame/`.

`MAX_LAYOUT_VALUE` lives in `layout/`, and the paint surface limit lives in `paint/`. `messageForNonError` and `isErrorInput` live in `vue/`, the lower unit shared by their composable and session consumers; fatal error reporting lives in `session/`.

The tree still has cross-unit edges the record's tables forbid — `host/ → vue/`, `layout/ → vue/`, `paint/ → session/`, `terminal/ → input/`, `terminal/ → vue/`, `dev/ → api/`, `text/ → host/`, `text/ → paint/`, `vue/ → terminal/`, and value edges in both directions between `vue/` and `session/`. `terminal/ → vue/` and `dev/ → api/` carry values, and the second inverts the layering. Tasks 3 through 7 remove all of them; the tables hold at the end of task 7, not at the end of this one.

## 3. Finish the layout engine boundary

`layout/` is the only Yoga owner: a private `WeakMap` holds every node-to-engine handle, and the lifecycle ledger owns allocation, idempotent release and rollback. A transaction returns `ComputedLayout` with resolved geometry, insets, visibility and measured wrapped lines, and paint reads only that snapshot. `host/` exposes no Yoga handle or sentinel, and `render.ts` plus `render-to-string.ts` remain the two transaction callers.

Focus asks `layout/` for authored visibility as a live tree query, so hidden targets are rejected before the first layout and while a surface is suspended. The query excludes nodes collapsed only by a zero-content guard during the current layout pass.

## 4. Give each surface its own implementation

`surface/` dispatches a resolved surface kind once to `InlineSurface`, `FullscreenSurface` or `DocumentSurface`. The shared `Surface` contract owns frame presentation, history handoff, suspension, resume and teardown, and `SurfaceRuntime` supplies stream writes and transactions, viewport dimensions, stdout facts and lifecycle callbacks. Inline owns its bounded region, variable-height reset and previous-frame rewrite; Fullscreen owns the alternate-screen and cursor leases, resize-invalidated row diffs and output-transaction rollback; Document writes history immediately and its latest dynamic frame exactly once on clean teardown. `render.ts` coordinates Vue and output transactions and reads surface facts only through `Surface`.

## 5. Extract the terminal backend

**Today.** Terminal state is spread across eight files. Five write to an output stream (`render.ts`, `surface/log-update.ts`, `terminal/kitty-keyboard.ts`, `terminal/output-coordinator.ts`, `terminal/stdin-controller.ts`) and five name `setRawMode`: `render.ts` and `terminal/stdin-controller.ts` call it on the stream, `vue/composables/useStdin.ts` routes through the context, `vue/context.ts` declares the type and `render-to-string.ts` supplies an inert stub. `exitAlternativeScreen` is written from two sites in `surface/fullscreen-surface.ts` and `enterAlternativeScreen` from one; each carries its own best-effort write and ownership bookkeeping rather than a lease. `StdinController` receives seven callbacks from the mount closure — `acquireKittyKeyboardDemand`, `isKittyKeyboardReady`, `beforeManagedInputAcquire`, `isManagedInputSurfaceReady`, `writeTerminalOutput`, `requestTerminalReconcile`, `reportManagedInputFailure` — because enabling bracketed paste and the Kitty protocol requires writing bytes and there is no terminal object to ask. Eleven files import `node:*`, and eight use `process` for a value — three more only name it in comments — including `render-to-string.ts` (inert streams from `node:stream`, colour resolved against `process.stdout` and `process.env`), `api/testing.ts` (stream defaults) and `vue/node-ops.ts` (`NODE_ENV`), each of which the steps below must route through the backend or the Done line must list as an exception.

**Steps.**

1. Define `TerminalBackend`: `write` / `onData` / `size` / `onResize` / `capabilities`, plus one lease operation generic over a mode identifier. The six modes today are raw mode, the alternate screen, cursor visibility, synchronized output, bracketed paste and the Kitty protocol.
2. Build `terminal/node/`, which wraps the streams handed to `MountOptions` on entry. Outside that directory, Runtime operates the terminal only through the backend; the accepted `useStdin` escape hatch may still return the borrowed input stream by identity.
3. Route the five writers through the backend and make `exitAlternativeScreen` one release path paired with the one enter site.
4. Move decoded input framing and partial UTF-8 state from `terminal/stdin-ingress.ts` to `input/shared-input-ingress.ts`; `session/` keeps the controller that joins dispatcher demand and delivery to the backend.
5. Replace `StdinController`'s seven callbacks with one backend reference.
6. Move capability answers off `process.env` and `isTTY` sniffing in core and onto the backend.
7. Add a test backend that records bytes and answers a fixed size, so suites that only need a terminal stop constructing fake streams.

**Done when.** One `TerminalBackend` interface has node and test implementations; `exitAlternativeScreen` has one write site; only `terminal/node/` imports `node:*` and `process` for values; `input/` owns byte framing through delivery, while `session/` owns the controller that joins input demand to the backend.

**Verify.** `grep -rn 'from "node:' packages/runtime/src` and `grep -rn 'process\.' packages/runtime/src` list nothing outside `terminal/node/`, with the type-only `node:stream` imports in `api/` and `vue/` as the recorded exception. The PTY suites cover this layer's behaviour.

**Watch for.** A block of dedicated acquisition and release bookkeeping per mode reproduces the scattered ownership this task exists to remove; the lease is [generic over the mode](./architecture.md#mode-leases) for that reason. Task 8 moves the corresponding bytes behind it. `MountOptions.stdout` remains a Node `Writable` by accepted decision, and `useStdin` still hands the caller the exact `Readable` passed to `MountOptions.stdin` — the boundary governs operating the device, not stream identity.

## 6. Make paint return a frame

**Today.** `paint()` returns a `string`. `Output.get()` in `paint/paint.ts` builds a `StyledChar[][]`, fills it, joins it with newlines and discards it; the shared `blankCell` at `paint/paint.ts:317` exists to avoid one object per cell. `StyledChar` carries its style as `AnsiCode[]` — an array of `{ code, endCode }` objects. Four separate stores hold "the previous frame": `SurfaceBase`'s `frame` in `surface/surface-contract.ts`, `FrameWriter`'s `lastFrame`, `log-update`'s `previousOutput`, and the Fullscreen baseline fields. `FrameWriter.sync()`'s comment records the defect two of them produced by drifting apart. Inline compares whole strings; Fullscreen splits on newlines and compares rows.

**Steps.**

1. Add coverage for every SGR attribute the current pipeline preserves before changing its representation, including numeric attributes without a dedicated off code and colon-form styles.
2. Create `frame/` — `Cell`, `Style`, `Frame`, `diff` — and port `Output` to fill it in the same step, with a temporary encoder so every caller still receives the string it expects. Common attributes use `attrs`; unmodelled authored attributes use the exact `extraSgr` fallback. Choose the memory layout against `benchmarks/runtime/renderer.bench.ts`.
3. Move the encoder into `surface/` and have each surface encode its own diff. The temporary encoder goes away with this step.
4. Collapse the four previous-frame stores into one per surface, and with them `FrameWriter.sync` and the desync it exists to prevent.

**Done when.** `paint()` returns a `Frame` — plain data holding one picture's worth of cells, with structured style stored inline and exact fallback SGR retained — and `Frame.diff` is the only place that answers "what changed".

**Verify.** `benchmarks/runtime/renderer.bench.ts` before and after: two frames are alive at once, so this is the step where a naive object grid would show up. The hyperlink and authored-SGR cases in `tests/paint/sanitize-ansi.test.ts` must pass. The PTY suites are the check that the screen is identical even where the bytes are not.

**Watch for.** The screen stays the same only if `Cell` keeps [everything the current pipeline preserves](./architecture.md#cell--one-character-cell). `@alcalzone/ansi-tokenize` pairs 1–4, 7–9 and 53 with dedicated off codes and carries other numeric SGR with the generic reset, so `attrs` alone is insufficient; `extraSgr` preserves the remainder. `Cell.link` is required for OSC 8 for the same reason. Emitted bytes may change because the encoder regenerates style transitions, but the resulting screen and active attributes do not. Parsing ANSI out of user-supplied `<Text>` content stays.

## 7. Turn the mount closure into a session object

**Today.** After task 4, `createApp` spans `render.ts:343`–`2803`; the mount closure inside it spans `1294`–`2735`. The enclosing closure holds 31 `let mounted*` variables, declared between `358` and `1233`, whose only purpose is to let `teardown()` reach resources the mount created. `render.ts` declares 51 function-scope boolean flags in all, most of them tracking exit, teardown and mount settlement alongside the `lifecycleTransactionDepth` counter at `722`; a further five, between `1547` and `1628`, track suspend and resume. `mountedDevApp` reaches back into teardown to implement development replacement.

**Steps.**

1. Lift the 31 mirror variables into fields of one object constructed by mount and read by teardown. Their null checks go with them.
2. Replace the exit, teardown and settlement flags with the lifecycle union `"mounting" | "running" | "suspended" | "tearing-down" | "torn-down"`, and let exhaustiveness checking reject the combinations the booleans could express.
3. Move `SIGTSTP`, signal exit and exit codes to the node backend: they are process facts, and what is left is a session state.
4. Give `DevSession` its own object that disposes one session and builds another, rather than branching inside `Session` through `mountedDevApp`.

**Done when.** `Session` is an object, teardown is `dispose()`, and the mirror variables are gone.

**Verify.** The lifecycle and teardown suites under `tests/runtime/integration/lifecycle/`, the PTY signal and exit suites, and the vite e2e suites that exercise HMR replacement and suspension.

**Watch for.** Attempted before tasks 3 through 6, this produces a three-thousand-line class instead of a three-thousand-line closure. The reduction comes from those tasks having already taken layout, surfaces, the terminal and the frame out.

## 8. Route mode bytes through the lease

**After tasks 4 and 5.** `TerminalBackend.acquire(mode)` returns a reference-counted lease, while the six modes still issue their enable and restore bytes at their individual call sites. The alternate screen and cursor live with surfaces; bracketed paste lives with the session input controller; the Kitty protocol and synchronized output have their own paths. Reference counting and operating the terminal are therefore still separate mechanisms.

**Steps.**

1. Move each mode's enable and restore bytes into `acquire` and `release` on the node backend, keeping the established ordering: managed input modes start after the output surface is ready, and teardown leaves the alternate screen before restoring raw mode.
2. Sweep outstanding leases on teardown, suspension and runtime failure from one place.
3. Delete the per-mode ownership bookkeeping at the callers, and give Inline's cursor handling the same lease path as Fullscreen.

**Done when.** One backend operation owns each mode's bytes, and `isModeHeld` determines whether restoration is due.

**Verify.** Search the Runtime source for the alternate-screen, cursor, bracketed-paste, Kitty and synchronized-output sequences; each mode has one implementation under `terminal/`. The PTY and lifecycle suites preserve terminal-visible behavior.

**Watch for.** Mode writes participate in output transactions: signal cleanup needs synchronous best-effort writes, while coordinated writes need handoff callbacks. A lease that always uses the ordinary coordinator cannot satisfy the emergency path.

## 9. Fold suspend, resume and teardown control into the lifecycle

**After task 7.** `Session.lifecycle` covers the top-level states, but suspend, resume and teardown still have subordinate booleans that can express invalid combinations.

**Steps.**

1. Model suspended, resuming and repainting as states of the suspension member of the lifecycle union.
2. Replace the teardown sub-flags with the valid teardown combinations, while keeping flags that exist only within one synchronous call as locals.

**Done when.** No boolean in `Session` expresses a fact that the lifecycle union can carry.

**Verify.** Run the lifecycle suites, the PTY suspension and signal suites, and the Vite end-to-end suites that exercise HMR replacement and suspension.

**Watch for.** A re-entrancy guard that is set and cleared within one synchronous call is not persistent lifecycle state and remains local.
