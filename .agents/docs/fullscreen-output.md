# Fullscreen output contract

The runtime selects this behavior with optional `mode: "inline" | "fullscreen"`; omission requests Inline. Own `fullscreen`, `alternateScreen`, `interactive`, and `debug` mount fields are removed programming errors and fail before terminal inspection or mutation. `liveUpdates` separately controls output cadence and does not grant a screen model. Fullscreen becomes effective only on a visual TTY with usable terminal dimensions; an explicit live-update override on a non-TTY stream cannot acquire the alternate screen, fixed viewport, or hit map. A screen-reader request for Fullscreen instead resolves to an Inline linear transcript on the main screen.

## The surface vue-tui owns

For normal visual rendering, fullscreen owns one fixed viewport with the terminal's current `columns × rows` dimensions. Yoga receives both dimensions, paint starts at viewport coordinate `(0, 0)`, and paint plus mouse hit testing are clipped to those bounds. Content outside the viewport cannot make the alternate screen scroll and cannot create an off-screen mouse target.

Every fullscreen commit hides the physical terminal cursor, clears and homes the viewport, writes the complete frame, and then places the cursor for the one visible focus-bound `useCaret()` request. The public request is an element-local rendered cell; the renderer maps it to the fixed surface before the writer emits terminal control bytes. This is intentionally a correctness-first full repaint, including when `incrementalRendering: true`; a future optimization may replace it with absolute cell diffs, but it must preserve the same visible result and coordinate contract.

This fixed origin keeps Yoga layout coordinates, visible paint cells, the resolved caret surface point, and SGR mouse coordinates in the same viewport. The application owns its insertion state and converts it to the element-local cell passed to `useCaret()`; the terminal cursor is the physical device state used to display the selected caret after the frame succeeds.

## Output outside the component tree

`useStdout().write()`, `useStderr().write()`, and the default patched `console.*` remain observable on their configured streams. On TTY destinations these coordinated helpers accept geometry-safe styled lines; redirected/non-TTY output remains byte-exact. After such a write, vue-tui immediately clears and repaints the owned viewport, so the write cannot move the live surface away from its layout, cursor, or hit map.

Direct calls to `process.stdout.write()` or `process.stderr.write()`, including writes through the raw streams returned by the composables, bypass vue-tui's output coordinator. The runtime cannot guarantee a fixed surface after bytes it does not receive; applications that need coordinated output must use the composable `write()` functions or leave console patching enabled.

## `<Static>` is an inline history primitive

`<Static>` means append-only terminal scrollback. Fullscreen has no separate scrollback region in which a line can remain permanently visible without changing the application's viewport coordinates. In fullscreen, vue-tui therefore emits new Static bytes to stream observers, warns once, and immediately repaints them away; it does not accumulate or retain them on the alternate-screen surface.

Persistent fullscreen history belongs in ordinary reactive application state rendered inside the layout, usually through a bounded `ScrollBox`. Use `<Static>` for inline transcripts and logs whose history should belong to the terminal.

## Boundaries

- Inline rendering uses the F1.6 bounded relative-writer contract: terminal-owned history remains immutable, while only the current managed region is replaceable.
- Screen-reader rendering remains a linear transcript on the main screen and resolves a Fullscreen request to effective Inline.
- Deterministic tests observe structured content commits through an internal render observer and inspect terminal-visible state through a separate xterm screen. Observation does not alter Fullscreen repaint behavior; `maxFps: 0` changes scheduling only.
- Resize recomputes the terminal-sized Yoga layout and repaints the fixed viewport synchronously.
- External suspension releases owned input modes, leaves the alternate screen, and restores the cursor before the process stops. Continuation uses fresh dimensions when available and otherwise retains the last coherent size, re-enters and repaints the fixed viewport, and only then reacquires still-requested input modes; a failed re-entry, cursor hide, or repaint rolls back to the suspended main-screen state. Unmount, clean exit, termination signals, and mount rollback use the same exact-ownership cleanup path. Ordinary re-entrant teardown waits for a repaint to complete, while a non-returning process or signal exit restores synchronously and skips final user rendering and Vue lifecycle hooks.
- A clean exit restores the original screen without replaying the final viewport. A fatal error restores the main screen first, writes a durable stack or message to stderr, and settles only after the restore and error writes complete.

The real-PTY regression fixtures are `packages/runtime-tests/integration/pty/fullscreen-origin.test.ts` and `packages/runtime-tests/integration/pty/suspension.test.ts`. They feed the byte stream through a terminal emulator and check Static, stdout, stderr, patched console, ordinary reactive rerenders, vertical and horizontal overflow clipping, cursor placement, physical-row mouse targeting, restore-before-stop, resize while stopped, re-entry, repaint, and final restoration.
