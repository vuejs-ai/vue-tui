# Fullscreen output contract

The runtime selects this behavior with optional `mode: "inline" | "fullscreen"`; omission requests Inline. Own `fullscreen`, `alternateScreen`, `interactive`, and `debug` mount fields are removed programming errors and fail before terminal inspection or mutation. `liveUpdates` separately controls output cadence and does not grant a screen model. Fullscreen becomes effective only on a visual TTY with usable terminal dimensions; an explicit live-update override on a non-TTY stream cannot acquire the alternate screen, fixed viewport, or hit map. A screen-reader request for Fullscreen instead resolves to an Inline linear transcript on the main screen.

## The surface vue-tui owns

For normal visual rendering, fullscreen owns one fixed viewport with the terminal's current `columns × rows` dimensions. Yoga receives both dimensions, paint starts at viewport coordinate `(0, 0)`, and paint plus mouse hit testing are clipped to those bounds. Content outside the viewport cannot make the alternate screen scroll and cannot create an off-screen mouse target.

Every fullscreen commit hides the caret, clears and homes the viewport, writes the complete frame, and then restores a declared `useCursor()` position. This is intentionally a correctness-first full repaint, including when `incrementalRendering: true`; a future optimization may replace it with absolute cell diffs, but it must preserve the same visible result and coordinate contract.

This fixed origin is what makes targeted mouse events reliable: Yoga layout coordinates, the visible cell coordinates, `useCursor()` coordinates, and SGR mouse coordinates all refer to the same viewport.

## Output outside the component tree

`useStdout().write()`, `useStderr().write()`, and the default patched `console.*` remain observable on their configured streams. After such a write, vue-tui immediately clears and repaints the owned viewport, so the write cannot move the live surface away from its layout, cursor, or hit map.

Direct calls to `process.stdout.write()` or `process.stderr.write()` bypass vue-tui's output coordinator. The runtime cannot guarantee a fixed surface after bytes it does not receive; applications that need coordinated output must use the composables or leave console patching enabled.

## `<Static>` is an inline history primitive

`<Static>` means append-only terminal scrollback. Fullscreen has no separate scrollback region in which a line can remain permanently visible without changing the application's viewport coordinates. In fullscreen, vue-tui therefore emits new Static bytes to stream observers, warns once, and immediately repaints them away; it does not accumulate or retain them on the alternate-screen surface.

Persistent fullscreen history belongs in ordinary reactive application state rendered inside the layout, usually through a bounded `ScrollBox`. Use `<Static>` for inline transcripts and logs whose history should belong to the terminal.

## Boundaries

- Inline rendering keeps the relative writer and terminal-owned scrollback semantics while F1.6 defines the exact ownership and overflow contract.
- Screen-reader rendering remains a linear transcript on the main screen and resolves a Fullscreen request to effective Inline.
- Deterministic tests observe structured content commits through an internal render observer and inspect terminal-visible state through a separate xterm screen. Observation does not alter Fullscreen repaint behavior; `maxFps: 0` changes scheduling only.
- Resize recomputes the terminal-sized Yoga layout and repaints the fixed viewport synchronously.
- Unmount, exit, and signals restore cursor, input modes, raw mode, and the original screen through the existing teardown path.

The real-PTY regression fixture is `packages/runtime-tests/integration/pty/fullscreen-origin.test.ts`. It feeds the byte stream through a terminal emulator and checks Static, stdout, stderr, patched console, ordinary reactive rerenders, vertical and horizontal overflow clipping, cursor placement, and physical-row mouse targeting.
