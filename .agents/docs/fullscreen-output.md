# Fullscreen output contract

Runtime selects this behavior with `mode?: "inline" | "fullscreen"`; omission requests Inline. An explicit Fullscreen request requires a TTY stdout and positive terminal dimensions. Runtime throws synchronously before user setup or terminal mutation when either requirement is unavailable; it never silently changes the request to Inline. The removed `fullscreen`, `alternateScreen`, `interactive`, `debug`, and screen-reader presentation options have no hidden compatibility path.

## The surface vue-tui owns

Fullscreen owns one fixed viewport with the terminal's current `columns × rows` dimensions. Yoga receives both dimensions, paint starts at viewport coordinate `(0, 0)`, and every painted cell is clipped to those bounds. Content outside the viewport cannot scroll the alternate buffer.

After a valid baseline, ordinary consecutive frames replace only changed rows through absolute cursor addressing. Initial paint, dimension changes, continuation, uncertain physical output state, and coordinated patched-console output repaint the complete viewport when necessary. Runtime hides the physical cursor while it owns the frame and restores generic cursor visibility when it releases the terminal; it has no semantic caret-placement contract or controller.

The fixed origin is required by current behavior even without pointer or caret APIs: Yoga layout, paint clipping, absolute row replacement, resize, and coordinated console output must agree on which terminal rows Runtime owns. The private row-diff optimization may change without altering that surface contract.

## Output outside the component tree

With the default `patchConsole: true`, `console.*` output passes through Runtime's ordered output gate. Runtime temporarily releases or repaints the owned viewport so logs do not corrupt the next frame. `patchConsole: false` is the escape hatch and leaves the global console untouched.

Direct calls to `process.stdout.write()`, `process.stderr.write()`, or a mounted custom stream bypass Runtime's output gate. Runtime cannot repair terminal position after bytes it never received. There is no public `useStdout()`, `useStderr()`, coordinated-write result, or arbitrary protocol-write API.

## `<Static>` is an Inline history primitive

`Static` is exported from `@vue-tui/runtime/inline` because it means irreversible terminal history rather than common layout. It has no collection API: one mounted instance remains open until its first non-empty eligible slot output, then commits once, releases its slot subtree through ordinary Vue lifecycle, and never rewrites accepted history. Vue iteration and stable keys own collections, while remounting begins another history block.

An effective Fullscreen surface rejects the presence of `Static`, including an output-free instance, before Static bytes, dynamic output, or a new viewport frame can be committed. If setup already acquired terminal resources, ordinary fatal teardown restores them before reporting the error. Non-TTY streams and string rendering remain supported because they do not acquire a Fullscreen surface.

Persistent Fullscreen history belongs in reactive application state rendered inside the viewport, usually through a bounded `ScrollBox`. Use `Static` for records whose completed history should belong to an Inline terminal or serialized document.

## Lifecycle boundaries

- Resize recomputes the terminal-sized Yoga layout and repaints the fixed viewport.
- Job-control suspension releases owned input modes, cursor visibility, and the alternate screen before the process stops. Continuation refreshes coherent dimensions when available, re-enters and repaints Fullscreen, and then reacquires still-requested input modes.
- Mount rollback, ordinary unmount, clean exit, HMR teardown, process exit, and terminating signals share exact resource ownership. Non-returning process and signal exits use synchronous best-effort restoration.
- Clean exit restores the original main screen without replaying the final viewport. Fatal exit restores the main screen before writing the durable stderr report.
- Deterministic observation is a repository testing mechanism and does not alter physical repaint behavior.

The current real-PTY evidence lives in `packages/runtime-tests/integration/pty/fullscreen-origin.test.ts` and `packages/runtime-tests/integration/pty/suspension.test.ts`. It covers alternate-screen ownership, row replacement, clipping, console coordination, resize, restore-before-stop, continuation, repaint, error reporting, and final terminal restoration. Historical pointer and semantic-caret assertions are not part of the current contract.
