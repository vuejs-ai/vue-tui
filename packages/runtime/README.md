# @vue-tui/runtime

> **Public beta** — the `@vue-tui/runtime` API is stabilizing toward 1.0; dev-mode HMR is still experimental. Bug reports welcome.

Vue 3 terminal renderer with Yoga flexbox layout — build rich TUI apps with the same component model you use on the web.

[![npm version](https://img.shields.io/npm/v/@vue-tui/runtime?color=%2342b883)](https://www.npmjs.com/package/@vue-tui/runtime)
[![npm downloads](https://img.shields.io/npm/dm/@vue-tui/runtime)](https://www.npmjs.com/package/@vue-tui/runtime)

## Why

- **Vue SFC & JSX** — `<template>`, TSX, or render functions — your choice
- **Yoga flexbox** — the same layout engine behind React Native, not a CSS-subset hack
- **Built-in input system** — keyboard handling, focus management, Tab navigation
- **Fullscreen selection and copy** — semantic Text ranges plus explicit custom or OSC 52 clipboard transport
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
| `<Static>`    | Commits one mounted slot tree to terminal history; import from `@vue-tui/runtime/inline`       |
| `<Transform>` | Applies a string transform function to each rendered line                                      |

`Static` lives only on `@vue-tui/runtime/inline` and has no props or collection-specific named types:

```ts
import { Box, Text } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
```

Use ordinary Vue iteration and stable keys for a collection:

```vue
<Static v-for="entry in completedEntries" :key="entry.id">
  <CompletedEntry :entry="entry" />
</Static>
```

Each mounted instance commits its current slot tree once. Acceptance releases the slot subtree but preserves the component instance as its write-once identity, so reactive updates and keyed reorder do not replay accepted history. An output-free first commit also accepts the instance; use an outer `v-if` if content is not ready. A Static below a Box hidden by `display="none"` or `v-show` remains open and commits once when that ancestor is shown. Do not nest Static inside another Static, Text, or Transform. Remounting creates a new history block. Open instances in one transaction commit in current tree order, but terminal history is irreversible: a new instance later inserted before an accepted sibling still appends physically. Effective visual Fullscreen rejects `Static` before Static bytes or a replacement frame are written; keep Fullscreen history in application state, for example with a bounded `ScrollBox`.

Vue's built-in `v-show` is supported on `<Box>` roots in templates and compiled render functions. It keeps the component subtree mounted while mapping hidden state to Yoga layout, paint, focus, geometry, caret, and Fullscreen hit testing. `v-show="false"` always hides; when it becomes true, the latest Box `display` prop applies, so `display="none"` remains hidden. This contract is deliberately Box-rooted: applying `v-show` directly to `Text`, `Transform`, or `Static` is not supported.

Nested `<Text color="revert">` and `<Text color="initial">` spans reset only their foreground to the terminal default. Reset spans may nest and wrap; an enclosing foreground resumes after the span, while background, bold, underline, and the other independent text styles continue to apply.

## Composables

| Composable                      | Description                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `useInput(handler, opts?)`      | Normalized key, text, paste, and uninterpreted input with an explicit routing result                        |
| `useInputAvailability()`        | Readonly managed-input availability for the current host                                                    |
| `useMouseEvent(ref, event, fn)` | Targeted Fullscreen `"click"` or `"wheel"`; import from `@vue-tui/runtime/fullscreen`                       |
| `useMouseDrag(ref, fn, opts?)`  | One captured Fullscreen drag lifecycle; import from `@vue-tui/runtime/fullscreen`                           |
| `useTextSelection(ref, opts?)`  | Command and pointer selection for exactly one top-level Fullscreen Text; import from the Fullscreen subpath |
| `useClipboard()`                | Read and write through the one app-owned custom or OSC 52 clipboard transport                               |
| `useFocus(ref, opts?)`          | Opaque ref-bound focus target with rendered-order traversal and boolean `focus()` / `blur()`                |
| `useFocusScope(opts?)`          | Nested active region or hard trapped boundary provided to descendants                                       |
| `useFocusedInput(target, fn)`   | Normalized input attached to one exact focused target                                                       |
| `useFocusScopeInput(scope, fn)` | Normalized input attached to a boundary or ancestor scope                                                   |
| `useExternalInput(target, fn)`  | One normalized external fallthrough receiver for an exact focused target                                    |
| `useFocusManager()`             | Exact focused-target observation plus boundary traversal and blur                                           |
| `useApp()`                      | App lifecycle — `{ exit(error?), waitUntilRenderFlush() }`                                                  |
| `useRenderSession()`            | Readonly reactive host facts — mode resolution, output, dimensions, and capabilities                        |
| `useLayoutSize()`               | Reactive root layout dimensions — readonly refs with nullable `rows`                                        |
| `useAnimation(opts?)`           | Frame-based animation loop — returns `{ frame, time, delta, reset }`                                        |
| `useElementGeometry(ref)`       | Atomic paint-derived parent/surface/visible-surface geometry for a normal Vue component ref                 |
| `useCaret(ref, opts)`           | Focus-bound caret at an element-local rendered cell with explicit reactive state                            |
| `useStdin()`                    | Access the actual mounted stdin as a raw byte-stream escape hatch                                           |
| `useStdout()`                   | Commit geometry-safe styled lines with explicit flow control, or access the deliberately raw stdout stream  |
| `useStderr()`                   | Commit geometry-safe styled lines with explicit flow control, or access the deliberately raw stderr stream  |

`useInput()` delivers a frozen event whose `kind` is `"key"`, `"text"`, `"paste"`, or `"uninterpreted"`. Return `"continue"` when the handler did nothing and `"consume"` after it handled the event. For advanced routing, return a complete `InputRouteDecision` to choose action reporting, later routing, terminal defaults, and external forwarding independently. All application-global handlers run in registration order for each event before their decisions are merged.

Raw stdin runs in parallel with vue-tui's managed input route. It may include terminal protocol replies and bracketed-paste framing, and vue-tui does not guarantee deduplication, priority, or safe composition with `useInput()`.

`useInputAvailability()` reports whether managed input can be activated without acquiring any terminal resource. `useStdin()` exposes no framework raw-mode controls. Managed input is available only on a controllable TTY. The first active managed input consumer acquires raw mode, bracketed-paste reporting, the shared listener, stdin ref state, and configured Kitty keyboard negotiation; the last consumer releases them. While that demand is active, an exact Ctrl+C is a delayed framework default that a handler can prevent for that event. Direct stream listeners do not create managed demand. A non-TTY stream remains available through `useStdin().stdin` for raw pipe bytes, while an active managed handler fails before publishing a route or changing terminal state. Mount options containing the removed `rawMode` or `exitOnCtrlC` fields are rejected before terminal mutation.

`useElementGeometry(ref)` reports one frozen, readonly geometry generation derived from what paint actually mapped. Resolved states expose full parent-relative and dynamic-render-surface bounds plus exact fragments whose `visibleSurface` is the clipped surface-coordinate rectangle or `null`; `unavailable`, `detached`, `pending`, `hidden`, `zero-size`, `fully-clipped`, and `visible` are separate states. It supports both rendering modes without exposing Inline's unstable physical terminal row, and reports `unavailable` when a visual 2D target surface does not exist.

`useCaret(ref, { focus, position })` connects one rendered element to one exact `useFocus()` result. `position` is a zero-based rendered cell local to `ref`; the editor remains responsible for converting its logical insertion point to that cell. The runtime publishes a frozen readonly `state` and maps a visible request through paint into the current mode writer. It emits no targeted terminal-cursor controls for inactive, clipped, detached, invalid, non-TTY, screen-reader, or string-host requests. The public caret describes an editor's insertion marker; the private terminal cursor is only the physical transport used to display it.

### Fullscreen text selection and clipboard

`useTextSelection()` is exported from `@vue-tui/runtime/fullscreen`. It targets exactly one top-level `<Text>` and derives the copied semantic document from that Text tree, including nested styled Text. It does not accept a duplicate text value, a Box, a nested Text target, or a list of sources.

```vue
<script setup lang="ts">
import { shallowRef, type ComponentPublicInstance } from "vue";
import { Text, useInput } from "@vue-tui/runtime";
import { useTextSelection } from "@vue-tui/runtime/fullscreen";

const documentRef = shallowRef<ComponentPublicInstance | null>(null);
const selection = useTextSelection(documentRef);

useInput((event) => {
  if (event.kind === "text" && event.text === "a") {
    selection.selectAll();
    return "consume";
  }
  if (event.kind === "text" && event.text === "c") {
    void selection.copy();
    return "consume";
  }
  return "continue";
});
</script>

<template>
  <Text ref="documentRef"
    >Select 你🙂 across <Text color="cyan">nested styles</Text> and wraps.</Text
  >
</template>
```

`move()` accepts `backward`, `forward`, `up`, `down`, `line-start`, `line-end`, `document-start`, or `document-end`, with `{ extend: true }` retaining the anchor. Movement and pointer drag stop only at complete grapheme boundaries; up/down and line commands use visual rows, while soft wraps do not insert copied newlines. `selectAll()` and `clear()` return whether they changed the selection. `copy()` returns `{ status: "empty" }` when there is no range or the range is collapsed and otherwise returns the clipboard result with the exact selected text.

Selection is built from semantic Text and successful final-paint provenance. Clipped or covered content remains part of command selection, but inverse highlighting appears only on target cells that survive final composition in the displayed frame. A failed write retains the preceding accepted mapping. Transform, truncation, or another source-to-cell mapping that cannot remain exact reports `mapping-unavailable` instead of approximating. Removing or retargeting the Text clears its range; several documents may register, but only one range remains active across the app.

`isActive` and `pointer` both default to true. `{ pointer: false }` keeps command selection without acquiring mouse demand and allows command-only selection on a targetable Fullscreen output whose managed stdin is unavailable. The default active pointer path uses F6 preflight and fails rather than publishing a dead mouse route. Active visual Inline use throws because Inline has no stable targetable origin; final or non-terminal output reports `host-unavailable`, screen-reader output reports `screen-reader`, and string rendering reports `string-host`. Suspension preserves the accepted text and range with status `suspended`, then continuation makes it ready only after repaint.

`useClipboard()` is exported from the common root and requires one explicit mount transport:

```ts
createApp(App).mount({
  mode: "fullscreen",
  clipboard: { kind: "osc52" },
});
```

The OSC 52 adapter returns `requested` after writing the UTF-8 Base64 request; vue-tui cannot observe terminal acceptance and never reports `copied` for it. A custom adapter has the shape `{ kind: "custom", writeText }` and returns `copied`, `requested`, `unavailable`, or `rejected`. Calls run in FIFO order and recheck suspension or disposal before queued work starts. Every `ClipboardWriteResult` contains the exact requested text, so unavailable or rejected results can be shown as a manual fallback without retaining another copy source. The runtime supplies no default transport, operating-system command, payload-limit guess, or automatic fallback chain.

`useClipboard().availability` distinguishes an `available` custom or OSC 52 transport from `not-configured`, `output-not-terminal`, `screen-reader`, `suspended`, `disposed`, or `string-host`. A custom adapter can work on Inline, Fullscreen, final, non-terminal, or screen-reader live hosts; when that adapter returns unavailable, the write result uses `transport-unavailable` and preserves its optional reason as `detail`. OSC 52 requires live visual terminal output.

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

Use `createApp(App).mount({ mode: "fullscreen" })` to render in the terminal's alternate screen. `Box` and `Text` remain passive in both modes; attach targeted click, wheel, captured-drag, or top-level-Text selection behavior to an ordinary component ref through `useMouseEvent()`, `useMouseDrag()`, or `useTextSelection()` from `@vue-tui/runtime/fullscreen`. Active hooks reject an effective visual Inline surface instead of silently doing nothing. Expected non-targetable pointer presentations remain inert, while selection reports an explicit unavailable state. Because the alternate screen is a fixed application-owned viewport, an effective visual Fullscreen surface rejects `Static`; use application state and a viewport component for retained Fullscreen content.

Mouse reporting is demand-driven: only a visible target from an accepted Fullscreen frame acquires the minimum required SGR level, and removing the last target restores it. While reporting is active, the terminal normally gives mouse selection and wheel input to the application instead of its native selection or scrolling. `useTextSelection()` provides application-owned replacement selection for one Text document; leaving it and other mouse hooks inactive keeps terminal-native behavior in control.

The live host requires controllable TTY input and an xterm-compatible SGR mouse profile; `TERM=dumb` is rejected when a visible target first demands reporting. SGR has no capability handshake, so a terminal that accepts the control bytes but silently ignores mouse reporting is indistinguishable from a user who sends no mouse input. In that case the hook receives no events and vue-tui does not guess or fall back to a different protocol.

Omitting `mode` requests Inline. On a visual TTY, Inline keeps short output short and limits its replaceable live region to the terminal's rows and columns. A naturally over-height tree is first laid out within the available rows; non-shrinking remainder is then clipped from the bottom. Use one keyed `<Static>` instance from `@vue-tui/runtime/inline` per completed history block, or a bounded `ScrollBox`/application offset when the visible content should follow a tail or selected item. Inline never clears the main screen or scrollback as an overflow fallback.

Before its first visible managed output, Inline advances to a fresh terminal row so content that already occupied the current row cannot be erased by a later update. `<Static>`, `useStdout().write()`, `useStderr().write()`, and patched console calls coordinate with the live region and commit their output once. On a TTY, the coordinated `write()` functions accept styled multiline text: they retain SGR, OSC 8 hyperlinks, and line feeds while removing cursor/erase sequences, other OSC commands, and geometry-changing control bytes. Redirected stderr and non-TTY streams remain byte-exact. The `stdout`/`stderr` streams returned by those composables, direct `process.stdout.write()`, and other raw stream writes deliberately bypass sanitization and ownership coordination. After a terminal resize, the old frame remains an immutable snapshot and vue-tui starts a new bounded region rather than erasing rows whose physical positions may have changed.

Each coordinated `write()` returns a `CoordinatedWriteResult`. `{ status: "accepted", writable: true }` means the complete transaction was accepted and another may start immediately. `{ status: "accepted", writable: false, ready }` means the bytes were accepted exactly once but the stream backpressured; await `ready` before starting another transaction. `{ status: "blocked", ready }` means an earlier transaction owns the output gate, the new bytes were not retained, and the caller may retry after `ready` only if they are still desired. A `false` Writable return is therefore acceptance with flow control, not a request to resend the same bytes.

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
