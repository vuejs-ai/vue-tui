# Dev-server and HMR architecture

How a source edit reaches a running terminal application, which component owns what, and where each failure exits. Covers `@vue-tui/vite` and the Runtime dev path it drives.

How these claims are proven is in [testing the dev server and HMR](./hmr-testing.md).

Not covered here: production builds (applications bundle with `tsdown`; the plugin is dev-only), the rendering-mode semantics of a reload (see [Development-reload modifier](./rendering-mode-matrix.md#development-reload-modifier)), and layer/dependency direction (see [package layers](./package-layers.md)).

Version-pinned claims below were checked against Vite 8.1.0, `@vitejs/plugin-vue-jsx` 5.1.5, and `unplugin-vue` 7.2.0. These are exact compatibility pins, not minimums; re-check the compiler configuration and HMR seams before any of them move.

## The constraint everything follows from

A terminal is one shared device with modal state — raw input mode, alternate screen, cursor visibility, bracketed paste — and no isolation. Anything that writes while an application owns it corrupts the frame, and a process that exits without restoring leaves the user's shell broken.

So the governing rule is **one writer at a time, with defined points where ownership is taken and given back**. Every structural decision below is a consequence.

What is _not_ a driving difference: the absence of a persistent view layer. It is tempting to argue that a browser's DOM preserves focus and scroll across a component swap and a terminal has nothing equivalent. The DOM preserves state across _patching_, which the terminal node tree also does; neither preserves it across component recreation. Vue's HMR semantics therefore apply unchanged, and no terminal-specific preservation mechanism is warranted. See [Rejected alternatives](#rejected-alternatives).

## Process model

**One process.** The Vite dev server and the application share the process the user launched, and the module runner hands modules across in memory. There is no IPC and no child process.

```
┌─ one Node process ───────────────────────────────┐
│                                                  │
│   Vite dev server         vue-tui Runtime        │
│   watch · compile         node tree · layout     │
│   module graph            paint · input          │
│         │                       ▲                │
│         └─── module runner ─────┘                │
│                                                  │
│   ── the real terminal: only this process ──     │
└──────────────────────────────────────────────────┘
```

The terminal already belongs to the launched process, so nothing has to be handed to anyone. Splitting the application into a child with `stdio: 'inherit'` would put two processes on one device — Vite gates `bindCLIShortcuts` on `process.stdin.isTTY` and clear-screen on `process.stdout.isTTY`, both read from the hosting process — so the parent would keep binding readline and writing to the same tty the child paints into, while the child mutates that device's input mode underneath it.

## Units and lifetimes

Three things, each replaced on a different cadence. Which layer something belongs to determines whether it survives an update.

```
┌─ process ────────────────────────────────────────────────┐
│  Terminal takeover      raw mode · alternate screen ·    │
│                         cursor · bracketed paste         │
│                         taken at mount, given back at    │
│                         exit; released on SIGTSTP and    │
│                         reacquired on SIGCONT            │
│  ──────────────────────────────────────────────────────  │
│  Painted node tree      nodes · yoga layout · output     │
│                         buffering · input dispatch       │
│                         rebuilt on every mount           │
│  ──────────────────────────────────────────────────────  │
│  Vue components         Vue's own HMR semantics:         │
│  and their state        template edit → instance kept    │
│                         script edit  → instance recreated│
└──────────────────────────────────────────────────────────┘
```

There is deliberately no fourth layer carrying view positions across replacements.

The bottom row is a property of the authoring format, not of this design. A `.tsx` file has no separate template block to diff, so `@vitejs/plugin-vue-jsx` only ever emits `__VUE_HMR_RUNTIME__.reload` — **every JSX edit is a script edit and recreates the instance**. Measured: a counter goes 3 → 0 on a JSX edit and 3 → 5 on an SFC template edit. The same is true on the web; it is not a gap to close.

## Update flow

One direction, with an explicit exit at each stage.

```
   source edit
       │
       ▼
   compile / evaluate fails ──▶ previous component keeps running;
       │                        Fullscreen error drawn over it;
       │                        Inline error follows its current frame
       ▼
   component render throws  ──▶ caught at the error boundary;
       │                        same mode-specific display; no unmount
       ▼
   output or stream throws  ──▶ existing fatal path: restore the
       │                        terminal, then exit with the cause
       ▼
   nothing accepts the update ─▶ full reload
```

The first exit is partly supplied by Vite and completed by the official plugin. A separate SSR post-preflight rejects source compilation before Vite applies the update. The runner logger observes fetch and transform failures, while a delegated evaluator catches inlined module evaluation failures — including Vite's lowercase-`fetch` logger gap — normalizes any legal thrown value into a reportable `Error`, forwards it once per propagation chain, and rethrows the original value. The plugin guards each update at Vite's `fetchUpdate` seam: synchronous throws and asynchronous rejections from any accept callback are reported without ending the process, and a failed disposer cannot discard healthy callbacks from the same batch. A pre-hook classifies repeated watcher tasks from a stable source-state identity; the bridge suppresses compiler payloads emitted before post hooks, and a post-hook prevents runner imports and full reloads. The HMR bridge then collapses a compatible client/SSR diagnostic pair from one remaining task. The compiler versions and Vite version are exact compatibility pins; missing private HMR seams, unsupported compiler configuration, and SSR environment-factory conflicts fail by name.

The second exit is a **dev-only** boundary, decided 2026-07-26 and implemented 2026-07-27. It holds the two phases that produce a component's output — **setup and render** — and deliberately no others: a throw from an event handler, a watcher, or a lifecycle hook leaves the tree able to render, and swallowing those would hide failures the developer needs to see reach their own handler. In a session connected by the official Vite plugin, such a throw not handled by a closer user boundary is caught by the overlay, drawn on screen, and the application stays up so a hot update can recover it; the error screen says the application is being held up by the dev overlay. The triggering update cannot clear its own render error, while a later successful update can. In production nothing changes: component failures stay Vue failures, and `onErrorCaptured()` and `app.config.errorHandler` apply as documented.

The third exit must stay fatal. A throw from an accepted stdout write is a Runtime failure whose exit completes only after restoration — see the ruling in [the decision ledger](./runtime-public-api-decisions.md). Treating it as a recoverable display state would leave the terminal in raw mode or on the alternate screen permanently.

## Full reload ordering

```
   give the terminal back ─▶ tear down the node tree ─▶ clear the module cache
                                                              │
              paint ◀── take the terminal again ◀── re-import ┘
```

Nothing crosses this cycle. That is what distinguishes a reload from a hot update: a reload's contract is that state is not preserved. Inline cannot erase output it already printed, so a reload continues below that history; Fullscreen owns a viewport and repaints it.

## Output ownership

- While a session is live, every byte goes through the output coordinator; nothing else writes.
- When no session exists — the entry failed to evaluate, so no application can render anything — exactly one designated fallback writer may write, and today that is the dev server's own error logging.
- The handoff points are the two ends of terminal takeover.

The invariant is _no uncoordinated writes_, not _zero writes_. A blanket zero would delete the only diagnostic channel for failures that never produce an HMR payload, which is why `logLevel` is set to `error` rather than `silent`.

**Who owns the terminal, and how it changes hands.** At most one session owns it per process, including when the plugin is evaluated through more than one module URL: the ownership registry lives on `globalThis`, not in one module instance. But "at a time" cannot be read as "a claim must find the slot empty": Vite restarts by creating the NEW server before closing the old one, and `configureServer` hooks — including post hooks — run inside that first step. So every `vite.config.ts` edit has the incoming session claiming while the outgoing one still holds. An overlap is therefore a **handover**: wait for the outgoing session to let go, up to five seconds. A genuinely concurrent second server never does, and still fails.

Three details are load-bearing, all corrected 2026-07-29 or earlier:

- **Claims are serialized.** Waiting is asynchronous, so without a queue two waiters both woke on the same release, both found the slot empty, and both installed themselves — the last write winning while the first believed it owned a terminal it did not.
- **A session torn down while its claim waits never takes the slot.** Releasing is identity-guarded against the _active_ session, so that close matched nothing and the claim installed a session whose server was already gone, holding the terminal against every later claim.
- **A session that loses closes its own server.** The claim is deliberately not awaited by Vite — awaiting it inside `_createServer` deadlocks every restart, because the outgoing session only releases during the `server.close()` that cannot run until `_createServer` returns. So the losing server cannot be failed at creation, and instead closes itself rather than holding ports and watchers for an application that will never mount. Runtime enforces the same boundary independently with a process-branded conflict error; if that later boundary catches a duplicate module-copy path the plugin closes the losing server there too without mistaking a user error that merely copied its name.

## Vite's boundary

Vite is a module supply service: watch, compile, compute what a change affects, deliver. It decides nothing above.

Configuration follows from that:

- **Vite's `ssr` environment.** It is correct on the three things that matter — Node platform resolution, module-runner delivery, and a runner-owned hot channel.
- **The Vue compiler uses its supported client-output mode.** `unplugin-vue` selects it through its supported `ssr: false` default, and the plugin rejects an explicit `ssr: true` configuration. The mismatch between "renders like a client" and "runs on Node" is a compiler-mode question, not an environment question, and treating it as one keeps the environment correct.

## Rejected alternatives

Each was considered and disproved. They are recorded so they are not re-derived.

### Run the application in a child process

Rejected. The stated benefits did not hold: Vite's module runner already clears its evaluated modules on full reload, and in-process reload is covered by passing tests. The stated costs are real: `stdio: 'inherit'` shares one tty between two processes, and most of the plugin's workarounds are not consequences of process topology — `@vitejs/plugin-vue` hardcodes its `file-changed` broadcast to the client websocket regardless of where the runner lives.

### A custom Vite environment with `consumer: "client"`

Rejected. Vite 8.1.0 binds three separate concerns to that one switch. The `resolve.builtins` escape is gated on `consumer === "server"`, so `node:fs` becomes a browser stub with no configuration able to prevent it; the same switch injects Vite's browser HMR client into the module graph, so `import.meta.hot` binds to a websocket transport while the plugin forwards events on the runner's channel. A probe that only inspected generated text looked like it worked; running the suite showed the application does not boot.

### A table of view positions surviving a replacement

Rejected. Vue's HMR already defines this: a template edit keeps the instance, a script edit recreates it and loses its state. The web loses focus the same way and treats it as the ordinary cost of a script change. The runtime also has a standing ruling that focus is never restored — becoming available again does not restore focus. And the mechanism is not constructible as described: `useFocus()` identities are anonymous, and a scroll region's position is derived from a follow-the-bottom flag, so restoring a stale line silently disables following and lands the viewport somewhere unrelated — worse than not restoring.

### Rolling back to the previous module

Rejected as inexpressible. Vite replaces the module record before any accept callback runs, and Vue's hot reload overwrites the component definition in place, so no previous version is retained. The guard condition is also undecidable: module top-level code runs before any callback observes it and can register timers, add process listeners, or change terminal modes. The case it was meant to serve — a new module that throws while evaluating — is already handled by the first exit above.

### Freezing the last painted frame

Rejected. Freezing stops output but not reactivity, timers, or input, so the user reads a stale frame while the tree changes underneath and keystrokes vanish; a resize invalidates the held frame outright. It also removes teardown from a path that is frequently a stream failure, which must restore the terminal.

## Implementation status

The architecture above is implemented. Its durable enforcement lives in the package unit tests, the `tests/vite` system suite, and the isolated starter smoke described in [testing the dev server and HMR](./hmr-testing.md); completed execution plans are left to Git history rather than retained as another source of current truth.

1. ~~**The Vue compiler is still put into client mode by patching.**~~ **Implemented 2026-07-26:** SFC development uses `unplugin-vue` in its supported default client mode. JSX keeps the narrow client-output adaptation that `@vitejs/plugin-vue-jsx` requires.

**Compiler compatibility, revised 2026-07-29.** The production path does not scan authored or generated JavaScript for compiler helper names. Source parsing duplicated the compilers' AST-level eligibility rules; output regexes then rejected legal user text such as `_sfc_ssrRender` and `/__vue-jsx-ssr-register-helper`. Instead, Vite and both compiler peers are exact compatibility pins, package tests require those pins to equal the versions running the suite, `unplugin-vue({ ssr: true })` and unsupported compiler integrations fail at configuration time, and real SFC and JSX end-to-end tests exercise client rendering, HMR, and helper-like user text. This trades unverified future-version support for a narrow tested contract without a second compiler-output parser. A missing Vite runner seam fails as `VueTuiViteHmrCompatibilityError`.

**Entry coordinates and equivalent filesystem roots.** A leading `/` is ambiguous in Vite: an existing absolute file is a filesystem entry, while a missing one is resolved from `config.root`. The plugin mirrors that rule so an entry outside the root is not imported under one identity and matched under another. With Vite's default `resolve.preserveSymlinks: false`, entry injection and unplugin-vue's `file-changed` comparison use physical filesystem paths when the target exists. This handles equivalent linked roots — on macOS, for example, a watcher may report `/var/folders/...` while Vite compiles `/private/var/folders/...`. When `resolve.preserveSymlinks: true`, both seams deliberately keep Vite's linked spelling instead. Without applying the same policy at both seams the connector is skipped or a template-only edit becomes a state-resetting reload. Unit tests exercise external and linked paths under both policies, and the isolated packed-starter journey proves that the normal real entry connects and preserves state.

2. ~~**The error display replaces the application instead of drawing over it.**~~ **Implemented 2026-07-27:** the same user root stays mounted. Fullscreen places an opaque terminal-default error panel over its viewport; Inline lays the error out after the current user frame, preserving terminal history and the live instance in both modes. The success status follows the same non-layout-shifting rule.

3. ~~**Setup or render failure ends the application.**~~ **Implemented 2026-07-27:** the official Vite dev wrapper catches only otherwise-unhandled setup and render failures, reports them as render errors, and lets a later hot update recover the same user root. User boundaries retain priority, and production error handling is unchanged.

4. ~~**A failure detected while the runner fetches or evaluates an update never reaches the overlay.**~~ **Implemented 2026-07-27:** source compilation is gated by an SSR post-preflight, and runner fetch/evaluation failures are observed through Vite's HMR logger plus a delegated evaluator. Serializable payloads retain compile/evaluate phase and source diagnostics; the same error on a later edit is reported again.

**Duplicate watcher tasks and compiler reports, revised 2026-08-01.** Under load, one physical write can cross Vite's 50 ms watcher suppression window and start a second `handleHMRUpdate` with a new timestamp. This was measured twice: an identical SSR JSX compiler payload 110 ms later, and the same absolute path, inode, size, `mtimeNs`, and `ctimeNs` observed at timestamps 101 ms apart; entry changes could likewise reload the in-process app twice. The dev pre-hook reads a stable source-state identity consisting of `{ dev, ino, size, mtimeNs, ctimeNs }` plus a content hash, then stores an immutable decision under Vite's task timestamp. That timestamp key is load-bearing because Vite may interleave `client(task 1)`, `client(task 2)`, `ssr(task 1)`, and `ssr(task 2)`. The bridge uses the decision to discard compiler custom/error payloads that can be emitted before post hooks, while the forwarding post-hook empties the duplicate's module list before runner import or full reload. Decisions and file states are bounded; an unreadable, unstable, collided, or evicted observation fails open. A same-size edit still changes the content identity and proceeds.

One remaining SFC task is still reported by two producers: the client environment through `ws.send`, and the SSR environment whose preflight rejected the update. `bridge-hmr.ts` records the producer route, watcher timestamp, and diagnostic identity, and collapses a compatible opposite-origin pair from the same defined timestamp. Optional metadata may be omitted as `undefined` or, for the client source frame, serialized as an empty string; either is absence, while two non-empty values must agree. Same-origin reports, reports from different watcher tasks, reports without a timestamp, or conflicting module, frame, plugin, or location metadata remain distinct. The Runtime timestamp guard stays as a second line of defence and for stale-update ordering, not as the primary duplicate detector.

5. ~~**A failed update ends the process when an accept callback throws.**~~ **Implemented 2026-07-27 at the mechanism rather than generated callback shapes:** the plugin guards every registered accept callback, including asynchronous callbacks and non-`Error` throws, and reports the failure without ending the process. One callback failure does not skip later callbacks in the same batch, and a failed disposer does not discard healthy updates.

**The Vite seam, corrected 2026-07-29.** `queueUpdate` is a batch, not an update: the first call in a microtask drains all queued `fetchUpdate(payload)` promises and invokes every returned callback. The guard therefore wraps `fetchUpdate`, which owns one update's import, disposer, and callback capture; an `AsyncLocalStorage` scope follows that update through fetch and into its returned callback. Its identity includes both Vite's accepting boundary (`path`) and changed dependency (`acceptedPath`), so two dependencies accepted by one boundary cannot suppress each other's root cause or expose a derived callback error. Registered callbacks are temporarily replaced with per-update guarded copies while Vite captures them, then restored before the first await. `packages/vite/tests/hmr-error-forwarding/client-updates.test.ts` drives the implementation through a real `ModuleRunner` from the exact supported Vite version, covering the private seam, batching, disposal, and callback behaviour without retaining a separate dependency-characterisation suite.

**A note on the SSR post-preflight, since it will look redundant again.** Two independent reviews measured it as dead by disabling it against the four hot-update failure shapes, where the runner logger and the delegated evaluator do cover everything. It is not dead: the path it alone covers is an **entry-level** compile error, where rejecting the update before Vite applies it is what stops a full reload from carrying the previous error across. `tests/vite/e2e/reload-carries-nothing-across.test.ts` goes red without it.
