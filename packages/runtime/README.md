# @vue-tui/runtime

> **Public beta** — the `@vue-tui/runtime` API is stabilizing toward 1.0; dev-mode HMR is still experimental. Bug reports welcome.

Vue 3 terminal renderer with Yoga flexbox layout — build rich TUI apps with the same component model you use on the web.

[![npm version](https://img.shields.io/npm/v/@vue-tui/runtime?color=%2342b883)](https://www.npmjs.com/package/@vue-tui/runtime)
[![npm downloads](https://img.shields.io/npm/dm/@vue-tui/runtime)](https://www.npmjs.com/package/@vue-tui/runtime)

## Why

- **Vue SFC & JSX** — `<template>`, TSX, or render functions — your choice
- **Yoga flexbox** — the same layout engine behind React Native, not a CSS-subset hack
- **Built-in input system** — keyboard handling, focus management, Tab navigation
- **Terminal-native** — renders directly to stdout, purpose-built for stateful interactive terminal applications
- **Coding-agent visual development guide** — a version-matched method for running the real application, inspecting the screen after terminal control sequences are applied, operating it, and iterating from what the agent sees

`@vue-tui/runtime` is a terminal platform renderer parallel to `@vue/runtime-dom`, comparable to [React Ink](https://github.com/vadimdemedes/ink) but adapted for Vue's reactivity model.

## Install

```bash
npm install @vue-tui/runtime vue
```

## Develop with a coding agent

If a coding agent changes visible terminal behavior, tell it to read the version-matched visual development guide shipped in this package before editing or accepting the result. Run this from the application directory:

```sh
node -p "require('node:path').join(require.resolve('@vue-tui/runtime/package.json'), '../docs/visual-development-feedback-loops.md')"
```

The guide defines a browser-independent loop built around a real PTY, an emulated active screen, a rendered image that the agent actually inspects, incremental user-path actions, deterministic tests, and terminal-restoration checks. [`@vue-tui/testing`](https://www.npmjs.com/package/@vue-tui/testing) provides fast content-frame and modeled-screen assertions, while the visual loop exercises the built application through the real PTY path.

`@vue-tui/runtime` ships the guide, not a controller, PTY library, terminal emulator, or image renderer. The coding-agent environment or application project supplies those capabilities.

For reliable discovery, copy the [provided instruction](./docs/visual-development-feedback-loops.md#tell-an-agent-to-use-this-guide) into the application's root `AGENTS.md`, `CLAUDE.md`, or equivalent agent-instruction file.

## Quick Start

```ts
// src/main.ts
import { createApp } from "@vue-tui/runtime";
import App from "./app.vue";

createApp(App).mount();
```

```vue
<!-- src/app.vue -->
<script setup lang="ts">
import { shallowRef } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";

const count = shallowRef(0);

useInput((event) => {
  if (event.kind !== "text") return "continue";
  if (event.text === "+") {
    count.value++;
    return "consume";
  }
  if (event.text === "-") {
    count.value--;
    return "consume";
  }
  return "continue";
});
</script>

<template>
  <Box>
    <Text>Count: </Text>
    <Text bold color="green">{{ count }}</Text>
    <Text dimColor> (+/- to change)</Text>
  </Box>
</template>
```

## Components

| Component     | Description                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `<Box>`       | Flexbox container — direction, wrap, align, justify, gap, padding, margin, borders, background |
| `<Text>`      | Styled text — color, bold, italic, underline, strikethrough, dimColor, wrap/truncate modes     |
| `<Spacer>`    | Expands to fill available space (`flex-grow: 1`)                                               |
| `<Newline>`   | Inserts line breaks (configurable `count`)                                                     |
| `<Static>`    | Renders inline items once above the redrawn region; fullscreen does not retain them            |
| `<Transform>` | Applies a string transform function to each rendered line                                      |

## Composables

| Composable                      | Description                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `useInput(handler, opts?)`      | Normalized key, text, paste, and uninterpreted input with an explicit routing result         |
| `useInputAvailability()`        | Readonly managed-input availability for the current host                                     |
| `useMouseInput(handler, opts?)` | Terminal mouse input — currently SGR wheel events with ref-counted mouse-mode ownership      |
| `useDraggable(ref, opts?)`      | Full-screen element dragging — reactive position and drag state from a normal template ref   |
| `useFocus(ref, opts?)`          | Opaque ref-bound focus target with rendered-order traversal and boolean `focus()` / `blur()` |
| `useFocusScope(opts?)`          | Nested active region or hard trapped boundary provided to descendants                        |
| `useFocusedInput(target, fn)`   | Normalized input attached to one exact focused target                                        |
| `useFocusScopeInput(scope, fn)` | Normalized input attached to a boundary or ancestor scope                                    |
| `useExternalInput(target, fn)`  | One normalized external fallthrough receiver for an exact focused target                     |
| `useFocusManager()`             | Exact focused-target observation plus boundary traversal and blur                            |
| `useApp()`                      | App lifecycle — `{ exit(error?), waitUntilRenderFlush() }`                                   |
| `useRenderSession()`            | Readonly reactive host facts — mode resolution, output, dimensions, and capabilities         |
| `useLayoutSize()`               | Reactive root layout dimensions — readonly refs with nullable `rows`                         |
| `useAnimation(opts?)`           | Frame-based animation loop — returns `{ frame, time, delta, reset }`                         |
| `useElementGeometry(ref)`       | Atomic paint-derived parent/surface/visible-surface geometry for a normal Vue component ref  |
| `useCursor()`                   | Position the terminal cursor — returns `setCursorPosition(pos)`; pass `undefined` to hide it |
| `useStdin()`                    | Access the actual mounted stdin as a raw byte-stream escape hatch                            |
| `useStdout()`                   | Commit geometry-safe styled lines, or access the deliberately raw stdout stream              |
| `useStderr()`                   | Commit geometry-safe styled lines to a TTY, or access the deliberately raw stderr stream     |

`useInput()` delivers a frozen event whose `kind` is `"key"`, `"text"`, `"paste"`, or `"uninterpreted"`. Return `"continue"` when the handler did nothing and `"consume"` after it handled the event. For advanced routing, return a complete `InputRouteDecision` to choose action reporting, later routing, terminal defaults, and external forwarding independently. All application-global handlers run in registration order for each event before their decisions are merged.

Raw stdin runs in parallel with vue-tui's managed input route. It may include terminal protocol replies and bracketed-paste framing, and vue-tui does not guarantee deduplication, priority, or safe composition with `useInput()`.

`useInputAvailability()` reports whether managed input can be activated without acquiring any terminal resource. `useStdin()` exposes no framework raw-mode controls. Managed input is available only on a controllable TTY. The first active managed input consumer acquires raw mode, bracketed-paste reporting, the shared listener, stdin ref state, and configured Kitty keyboard negotiation; the last consumer releases them. While that demand is active, an exact Ctrl+C is a delayed framework default that a handler can prevent for that event. Direct stream listeners do not create managed demand. A non-TTY stream remains available through `useStdin().stdin` for raw pipe bytes, while an active managed handler fails before publishing a route or changing terminal state. Mount options containing the removed `rawMode` or `exitOnCtrlC` fields are rejected before terminal mutation.

`useElementGeometry(ref)` reports one frozen, readonly geometry generation derived from what paint actually mapped. Resolved states expose full parent-relative and dynamic-render-surface bounds plus exact fragments whose `visibleSurface` is the clipped surface-coordinate rectangle or `null`; `unavailable`, `detached`, `pending`, `hidden`, `zero-size`, `fully-clipped`, and `visible` are separate states. It supports both rendering modes without exposing Inline's unstable physical terminal row, and reports `unavailable` when a visual 2D target surface does not exist.

### Render-session facts

`useRenderSession()` returns the authoritative readonly facts for the current render tree. The object identity stays stable for that tree. Its `host`, requested/effective `mode`, `output`, and `capabilities` are immutable session facts; `dimensions` is replaced atomically when the live host accepts a resize or refreshes dimensions after continuation. Use `session.output.presentation === "screen-reader"` when a component needs to adapt to the active linear presentation.

| Session field         | Meaning                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `host`                | `"live"` for a mounted or modeled live app; `"string"` for synchronous document rendering               |
| `mode`                | Requested mode, effective mode, and fallback for a live host; `null` for a string document              |
| `output`              | Destination, dynamic-update cadence, and visual or screen-reader presentation                           |
| `dimensions.terminal` | One coherent physical or modeled terminal size, or `null` when the host owns no terminal viewport       |
| `dimensions.layout`   | Root layout columns and the numeric enforced row bound or `null` for unbounded height                   |
| `capabilities`        | Immutable availability of stable origin, renderer-owned element hit testing, and coordinated suspension |

`useLayoutSize()` derives readonly `columns` and `rows` refs from the same session, so destructuring preserves Vue reactivity. `rows.value` is `number | null`: a number is the enforced root layout bound, while `null` means the stream, transcript, or string document has no row bound. These composables must be called inside a vue-tui render tree.

```ts
import { useLayoutSize, useRenderSession } from "@vue-tui/runtime";

const session = useRenderSession();
const { columns, rows } = useLayoutSize();

const isScreenReaderPresentation = session.output.presentation === "screen-reader";
```

## App Lifecycle

```ts
import { createApp } from "@vue-tui/runtime";

// Fire and forget (most common):
createApp(App).mount();

// Wait for the app to exit:
const app = createApp(App);
app.mount();
await app.waitUntilExit();

// Custom streams (for testing):
createApp(App).mount({ stdout, stdin, stderr });
```

Use `createApp(App).mount({ mode: "fullscreen" })` to render in the terminal's alternate screen. Full-screen mode enables targeted `@mousedown`, `@mouseup`, `@click`, and `@wheel` handlers on `<Box>` and `<Text>` when the app registers them; inline apps can still use the low-level `useMouseInput()` stream.

Omitting `mode` requests Inline. On a visual TTY, Inline keeps short output short and limits its replaceable live region to the terminal's rows and columns. A naturally over-height tree is first laid out within the available rows; non-shrinking remainder is then clipped from the bottom. Use `<Static>` for completed history, or a bounded `ScrollBox`/application offset when the visible content should follow a tail or selected item. Inline never clears the main screen or scrollback as an overflow fallback.

Before its first visible managed output, Inline advances to a fresh terminal row so content that already occupied the current row cannot be erased by a later update. `<Static>`, `useStdout().write()`, `useStderr().write()`, and patched console calls coordinate with the live region and commit their output once. On a TTY, the coordinated `write()` functions accept styled multiline text: they retain SGR, OSC 8 hyperlinks, and line feeds while removing cursor/erase sequences, other OSC commands, and geometry-changing control bytes. Redirected stderr and non-TTY streams remain byte-exact. The `stdout`/`stderr` streams returned by those composables, direct `process.stdout.write()`, and other raw stream writes deliberately bypass sanitization and ownership coordination. After a terminal resize, the old frame remains an immutable snapshot and vue-tui starts a new bounded region rather than erasing rows whose physical positions may have changed.

If an application intentionally wants to discard main-screen history, do so before mounting or after teardown. Use Fullscreen when the application needs arbitrary repaint of a stable terminal-sized viewport; Inline does not expose a mounted destructive-reset policy.

On supported non-Windows hosts, external job-control suspension is coordinated automatically. When the process receives `SIGTSTP`, vue-tui releases only the raw mode, bracketed paste, mouse level, Kitty keyboard state, cursor state, and alternate screen that the session acquired, then reliably stops itself with `SIGSTOP`. After `SIGCONT`, it refreshes the public session dimensions when available, otherwise keeps the last coherent size, starts a fresh Inline or transcript region, transactionally re-enters and repaints Fullscreen, or repaints a live stream using its refreshed unbounded layout, then restores still-requested input modes. This does not reserve the Ctrl+Z input byte.

Normal Inline output remains on the main screen. Normal Fullscreen exit restores the previous main screen and does not replay the last viewport. Fatal exit is different: a durably painted Inline or transcript error remains visible, with a sanitized stderr report when that rich error was clipped, stdout was lost, or its first physical write failed; Fullscreen restores first and then writes the report to stderr. Final-stream fatal exit never prints a stale successful dynamic frame and writes the error to stderr.

Mount, repaint, and teardown are exception-safe transactions. A partially initialized mount rolls back every resource it acquired, cleanup continues if one release throws, and an ordinary teardown or exit re-entered synchronously from a stream callback waits until the current acquisition or repaint is complete. A non-returning `process.exit()` or signal-exit callback instead restores owned terminal state immediately with synchronous writes and skips final user rendering and Vue lifecycle hooks. This protects the application's original error and prevents one failed cleanup from stranding another terminal mode.

> **Dev (`@vue-tui/vite`) note:** in a dev entry, prefer fire-and-forget `mount()`. The dev
> server already keeps the process alive, and a top-level `await app.waitUntilExit()` blocks the
> entry module's evaluation — which wedges Vite's HMR full-reload queue after the first reload.
> Reserve `await app.waitUntilExit()` for standalone/production entries (`node dist/main.js`).

## Render to string

Render a component as a synchronous, width-constrained visual document without acquiring a terminal. The document has no terminal mode, bounded row count, input, resize lifecycle, or live updates:

```ts
import { renderToString } from "@vue-tui/runtime";

const document = renderToString(App, { columns: 80 });
```

The default width is 80 columns. Terminal mode and screen-reader presentation are deliberately not options on this public string API. Shared components receive the deliberate document width and isolated inert streams; calling `useApp().exit()` or `useApp().waitUntilRenderFlush()` reports that the operation is unavailable.

## Links

- [vue-tui](https://github.com/vuejs-ai/vue-tui) — monorepo root
- [`@vue-tui/vite`](https://www.npmjs.com/package/@vue-tui/vite) — Vite plugin with terminal HMR
- [`@vue-tui/testing`](https://www.npmjs.com/package/@vue-tui/testing) — test harness for terminal components

## License

MIT
