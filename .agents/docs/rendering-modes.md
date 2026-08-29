# Runtime rendering modes

This is the canonical visual-host contract for mounted Runtime rendering. Public callers request Inline or Fullscreen; Runtime resolves that request with stdout capabilities into an effective surface. Input, color, deterministic observation, and scheduling are separate concerns and do not create additional public rendering modes.

The product direction is in [intent.md](./intent.md#rendering-modes). Exact accepted API judgments are in the [Runtime decision ledger](./runtime-api-decisions.md).

## Resolution model

Keep four concepts separate:

1. **Host:** mounted live process, deterministic test host, or synchronous string renderer.
2. **Requested mode:** Inline or Fullscreen for a mounted application.
3. **Effective surface:** main-screen live region, alternate-screen viewport, final-stream document, test observation, or returned string.
4. **Independent capabilities:** stdin behavior, terminal protocols, output cadence, dimensions, and color support.

`MountOptions.mode` accepts only `"inline"`, `"fullscreen"`, or omission; omission requests Inline. Runtime resolves the surface before reserving stdout, running user setup, or mutating terminal state.

## Mounted-host matrix

| stdout                          | Requested mode | Effective surface               | Key consequence                                                                                                                                       |
| ------------------------------- | -------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-TTY                         | Inline         | Final-stream document           | No screen controls. New `Static` history and coordinated console output write immediately; the latest dynamic document writes once on clean teardown. |
| Non-TTY                         | Fullscreen     | Final-stream document           | Same supported document host as a non-TTY Inline request. The mode request does not manufacture a TTY or alternate screen.                            |
| TTY                             | Inline         | Bounded main-screen live region | Runtime owns only its current region. Completed and abandoned output remains terminal-owned history.                                                  |
| TTY with positive dimensions    | Fullscreen     | Fixed alternate-screen viewport | Runtime owns and redraws the complete viewport until teardown.                                                                                        |
| TTY without positive dimensions | Fullscreen     | Preflight failure               | Fails before user setup, terminal mutation, or output; Runtime never silently changes the request to Inline.                                          |

TTY Inline remains live when a complete terminal size is unavailable; Runtime uses its modeled fallback rather than requiring Fullscreen's fixed-viewport guarantee. Terminal dimension probing accepts one coherent positive width-and-height snapshot and never combines fields from different sources into a claimed viewport.

Non-TTY behavior is independent of input. `useInput()` may still observe bytes from the selected stdin, while the document host acquires no output-screen or managed terminal-protocol state. There is no public `interactive`, `liveUpdates`, `alternateScreen`, `fullscreen`, or `debug` compatibility option.

## Layout transaction boundary

- **Ruling:** Treat each renderer commit as exactly one layout transaction. The renderer must provide the complete tree and constraints up front, and the layout system must return final geometry for every output region. The renderer must not inspect provisional geometry, change layout inputs, and run layout again. [VOUCHED @hyfdev 2026-08-29]
- **Limits:** Private measurement or independent-root work may use multiple engine calls inside the transaction, but intermediate geometry must not escape into renderer control flow. [VOUCHED @hyfdev 2026-08-29]
- **Why:** Yunfei rejected a scheme in which the renderer first requests provisional layout, reads that result, changes the layout inputs, and requests layout again. The layout system should receive the complete tree and constraints up front and return only final geometry.
- **Source:** Yunfei, 2026-08-29, explicit acceptance of the ruling and limits above and instruction to stamp the decision; this entry is the durable record.

## Inline screen ownership

Inline renders on the main screen and must not erase terminal history or shell output that existed before the application. Runtime therefore:

- establishes a fresh row before its first visible managed write without emitting a destructive full-screen clear;
- bounds over-height layout to the available terminal rows and clips paint to the terminal;
- replaces only the currently known live region;
- leaves accepted `Static` blocks, coordinated external output, and snapshots abandoned by resize in terminal-owned scrollback;
- starts a fresh bounded region after a real resize instead of erasing or attempting to rewrite reflowed history;
- leaves the final live content on the main screen and ensures later shell output starts below a full-height frame.

Runtime-generated Inline controls never use ED2, ED3, or Home to reset the main screen. An application that deliberately wants destructive main-screen behavior does so outside the mounted session or selects Fullscreen.

## Fullscreen screen ownership

Fullscreen enters the alternate screen only after preflight succeeds. Runtime then owns a fixed `columns × rows` viewport with a stable origin:

- Yoga receives the complete viewport dimensions and paint is clipped to them;
- ordinary frames may replace changed rows, while initial paint, resize, continuation, and uncertain output state repaint the complete viewport;
- the physical cursor is hidden while Runtime owns the viewport and restored on release;
- coordinated console output is followed by a clear/home repaint so the viewport remains coherent;
- clean teardown leaves the alternate screen and reveals the untouched main screen without replaying the final viewport.

The stable viewport is a screen contract, not a promise of future mouse, hit-testing, selection, or clipboard APIs.

## `Static` and external output

`Static` from `@vue-tui/runtime/inline` is a terminal-history primitive:

- Inline and final-stream document hosts accept it;
- an effective visual Fullscreen surface rejects its presence before committing Static bytes, observation, or a new viewport frame;
- Fullscreen applications keep durable history in reactive application state, commonly inside a `ScrollBox`.

With `patchConsole` enabled, Runtime coordinates `console.*` output with the active surface. Inline appends it above a redrawn live region; Fullscreen restores the viewport after the write; final-stream output writes it immediately. Returned raw streams and direct `process.stdout` or `process.stderr` writes bypass coordination and are outside this guarantee.

## Resize, suspension, and teardown

| Event                                    | Inline                                                                                                                 | Fullscreen                                                                                                                   | Final-stream document                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Resize                                   | Abandons the old physical snapshot as history and establishes a fresh bounded region.                                  | Re-resolves one coherent viewport size and repaints it synchronously. Invalid transient pairs retain the last coherent size. | No output resize lifecycle.                                                         |
| `SIGTSTP` / `SIGCONT` on supported hosts | Releases owned terminal/input state, then repaints a fresh region after continuation without erasing the old snapshot. | Leaves the alternate screen before stop, then transactionally re-enters and repaints before reacquiring input.               | Releases and reacquires owned input state only.                                     |
| Clean exit                               | Leaves final content on the main screen.                                                                               | Restores the previous main screen; no summary replay.                                                                        | Writes the latest dynamic document once, with a line ending only when needed.       |
| Runtime failure or explicit error exit   | Restores owned state, then reports the sanitized failure on stderr.                                                    | Restores the main screen before reporting.                                                                                   | Does not replay a stale successful document; reports after accepted output drains.  |
| Full HMR reload                          | Releases the old session, then the replacement mounts below retained history.                                          | Releases the alternate screen, then the replacement reacquires it.                                                           | Preserves the same application-lifecycle distinction without a live output surface. |

Acquisition and release are lifecycle transactions. Runtime rolls back every resource acquired before a failure, releases only state it owns, continues cleanup when one release throws, and prevents a second live application from owning the same stdout concurrently.

## Deterministic and string hosts

`@vue-tui/testing` mounts through the production Runtime path with deliberate modeled stdout, stdin, dimensions, mode, and color capability. Structured content frames and xterm screen snapshots are observation channels; they do not alter the resolved production surface or output cadence.

`renderToString()` is a separate synchronous host. It defaults to an 80×24 plain document, accepts `height: Infinity` for an unbounded document, acquires no process streams or terminal state, and prepends present `Static` output. It unmounts the temporary Vue tree after a successful initial patch and releases Runtime-owned services and Yoga allocations after every result.

## Evidence

- [`render-session.test.ts`](../../packages/runtime/tests/render-session.test.ts) pins pure surface resolution, including identical non-TTY results for both requested modes.
- [`ownership.test.ts`](../../packages/runtime/tests/host/layout-transaction/ownership.test.ts) keeps renderer and paint code on their sides of the layout transaction boundary.
- [`alternate-screen.test.tsx`](../../tests/runtime/integration/lifecycle/alternate-screen.test.tsx) covers alternate-screen acquisition, non-TTY behavior, and restoration.
- Runtime PTY suites under [`tests/runtime/e2e/pty`](../../tests/runtime/e2e/pty) cover Inline history, Fullscreen origin, resize, suspension, external output, and teardown on a real terminal.
- `@vue-tui/testing` integration suites verify that modeled hosts preserve the same production contracts while exposing deterministic observation.
