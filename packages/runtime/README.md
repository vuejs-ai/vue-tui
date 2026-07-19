# @vue-tui/runtime

> **Public beta** — the `@vue-tui/runtime` API is stabilizing toward 1.0; dev-mode HMR is still experimental. Bug reports welcome.

Vue 3 terminal renderer with Yoga flexbox layout — build rich TUI apps with the same component model you use on the web.

[![npm version](https://img.shields.io/npm/v/@vue-tui/runtime?color=%2342b883)](https://www.npmjs.com/package/@vue-tui/runtime)
[![npm downloads](https://img.shields.io/npm/dm/@vue-tui/runtime)](https://www.npmjs.com/package/@vue-tui/runtime)

## Why

- **Vue SFC & JSX** — `<template>`, TSX, or render functions — your choice
- **Yoga flexbox** — the same layout engine behind React Native, not a CSS-subset hack
- **Normalized input primitive** — stable text, paste, and key facts without exposing terminal-protocol details
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
  if (event.kind !== "text") return;
  if (event.text === "+") {
    count.value++;
    return;
  }
  if (event.text === "-") {
    count.value--;
  }
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

| Component  | Description                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `<Box>`    | Terminal layout container with the supported flex, size, spacing, border, clipping, visibility, and accessibility primitives |
| `<Text>`   | Terminal text with foreground/background color, dim, bold, inverse, wrapping, truncation, and accessibility primitives       |
| `<Static>` | Commits one mounted slot tree to Inline terminal history; import from `@vue-tui/runtime/inline`                              |

`Box` and `Text` have closed prop surfaces. The exported `BoxProps` type has these 28 fields:

| Purpose        | Box props                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------- |
| Flex layout    | `flexDirection`, `flexGrow`, `flexShrink`, `flexBasis`, `alignItems`, `justifyContent`, `gap` |
| Size/position  | `width`, `height`, `minWidth`, `minHeight`, `position`, `top`, `left`                         |
| Spacing        | `marginTop`, `paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight`                     |
| Paint/clipping | `borderStyle`, `borderColor`, `backgroundColor`, `overflowY`, `display`                       |
| Accessibility  | `ariaLabel`, `ariaHidden`, `ariaRole`, `ariaState`                                            |

The exported `TextProps` type has exactly `color`, `backgroundColor`, `dimColor`, `bold`, `inverse`, `wrap`, `ariaLabel`, and `ariaHidden`. `wrap` accepts `"wrap"` or end `"truncate"`; `borderStyle` accepts `"single"` or `"round"`. The exported `Color` type contains the 16 canonical terminal color names and a `#${string}` arm; Runtime checks that a hex value contains exactly six hexadecimal digits. Text foreground additionally accepts `"revert"` and `"initial"`.

Cell counts are integers from 0 through 65,535, signed `top`, `left`, and `marginTop` values range from -65,535 through 65,535, and flex factors are finite values from 0 through 65,535. Percentage width uses a plain decimal from 0% through 100%. Before allocating a visual grid, Runtime also limits the final surface to 1,048,576 cells, so individually valid width and height values are not a promise that every pair can be painted.

Unknown attributes are errors rather than ignored browser-style fallthrough. This includes removed props, misspellings, `class`, `style`, `data-*`, and listener attributes such as `@click`; `key`, `ref`, and Vue vnode lifecycle hooks remain normal Vue component mechanics. Vue templates do not reliably type-check undeclared fallthrough attributes, so Runtime performs this check before creating a terminal host node.

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

Each mounted instance commits its current slot tree once. Acceptance releases the slot subtree but preserves the component instance as its write-once identity, so reactive updates and keyed reorder do not replay accepted history. An output-free first commit also accepts the instance; use an outer `v-if` if content is not ready. A Static below a Box hidden by `display="none"` or `v-show` remains open and commits once when that ancestor is shown. Do not nest Static inside another Static or Text. Remounting creates a new history block. Open instances in one transaction commit in current tree order, but terminal history is irreversible: a new instance later inserted before an accepted sibling still appends physically. Effective visual Fullscreen rejects `Static` before Static bytes or a replacement frame are written; keep Fullscreen history in application state, for example with a bounded `ScrollBox`.

Vue's built-in `v-show` is supported on `<Box>` roots in templates and compiled render functions. It keeps the component subtree mounted while mapping hidden state to Yoga layout, paint, accepted Box presence, Box size, and Runtime-private Fullscreen hit testing. `v-show="false"` always hides; when it becomes true, the latest Box `display` prop applies, so `display="none"` remains hidden. This contract is deliberately Box-rooted: applying `v-show` directly to `Text` or `Static` is not supported.

Nested `<Text color="revert">` and `<Text color="initial">` spans reset only their foreground to the terminal default. Reset spans may nest and wrap; an enclosing foreground resumes after the span, while background and the retained boolean text styles continue to apply.

Runtime does not export layout conveniences as separate components. Write line breaks as text, and use an ordinary Box when a flex spacer is useful:

```vue
<Text>{{ "\n".repeat(count) }}</Text>
<Box :flexGrow="1" :flexShrink="1" />
```

## Composables

| Composable                      | Description                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `useInput(handler, opts?)`      | Frozen insertion text, complete paste payloads, and finite key identities; `isActive` gates input demand    |
| `useMouseEvent(ref, event, fn)` | Targeted Fullscreen `"click"` or `"wheel"`; import from `@vue-tui/runtime/fullscreen`                       |
| `useMouseDrag(ref, fn, opts?)`  | One captured Fullscreen drag lifecycle; import from `@vue-tui/runtime/fullscreen`                           |
| `useTextSelection(ref, opts?)`  | Command and pointer selection for exactly one top-level Fullscreen Text; import from the Fullscreen subpath |
| `useClipboard()`                | Read and write through the one app-owned custom or OSC 52 clipboard transport                               |
| `useApp()`                      | App lifecycle — `{ exit(error?), waitUntilRenderFlush() }`                                                  |
| `useLayoutWidth()`              | Readonly reactive width Runtime gives the root layout on every host                                         |
| `useViewportHeight()`           | Readonly reactive visual viewport height, or `null` at setup when the document is not row-bounded           |
| `useBoxSize(ref)`               | Last accepted full width and height of one directly referenced `<Box>`, or `null` when no size is available |
| `useBoxPresence(ref)`           | Whether one directly referenced `<Box>` belongs to the last accepted live renderer tree                     |
| `useStdin()`                    | Access the actual mounted stdin as a raw byte-stream escape hatch                                           |
| `useStdout()`                   | Commit geometry-safe styled lines with explicit flow control, or access the deliberately raw stdout stream  |
| `useStderr()`                   | Commit geometry-safe styled lines with explicit flow control, or access the deliberately raw stderr stream  |

`useInput()` delivers a frozen event whose `kind` is `"text"`, `"paste"`, or `"key"`. Text and paste events contain `text`; a key event contains either a finite `name` or one shortcut `character`, plus top-level `shift`, `alt`, and `ctrl` booleans. Terminal protocol, byte sequence, codepoint, repeat/release, and uninterpreted-input details remain private. Handlers normally return nothing. The exact object `{ preventDefault: true }` suppresses only Runtime's delayed Ctrl+C default for that event; it does not stop other `useInput()` subscriptions. Unless a handler throws, every subscription captured for an event runs in registration order.

Raw stdin runs in parallel with vue-tui's managed input route. It may include terminal protocol replies and bracketed-paste framing, and vue-tui does not guarantee deduplication, priority, or safe composition with `useInput()`.

`useStdin()` exposes no framework raw-mode controls. Managed input is available only on a controllable TTY. The first active `useInput()` subscription acquires raw mode, bracketed-paste reporting, an application input route, and Runtime-private Kitty keyboard negotiation. The last active subscription immediately releases raw mode, paste reporting, and that route. If Runtime already sent a Kitty capability query, it may retain the shared listener and a bounded timer briefly only to filter the late protocol reply; disposing the app releases that reply filter immediately. `isActive` is a ref, getter, or boolean that gates this demand. Direct stream listeners do not create managed demand. A non-TTY stream remains available through `useStdin().stdin` for raw pipe bytes, while an active managed subscription fails before dispatching an event or changing terminal state. Mount options containing the removed `rawMode`, `exitOnCtrlC`, or public Kitty configuration fields are rejected before terminal mutation.

### Focus and routing above Runtime

Focus identity, Tab order, nested scopes, modal traps, and propagation are application policy. Runtime therefore does not export a focus manager or targeted input hooks. An application or third-party library can keep that policy in Vue state, use `useBoxPresence()` for the renderer fact it cannot derive, and subscribe once to public input:

```ts
// Application code, not an @vue-tui/runtime API.
import { provide, shallowReactive, shallowRef, type Ref } from "vue";
import { useInput, type TuiInputEvent } from "@vue-tui/runtime";

type Target = {
  present: Readonly<Ref<boolean>>;
  handle: (event: TuiInputEvent) => boolean; // true stops this application route
};

const FocusHubKey = Symbol("FocusHub");
const focused = shallowRef<string | null>(null);
const targets = shallowReactive(new Map<string, Target>());
provide(FocusHubKey, { focused, targets });

useInput(
  (event) => {
    const id = focused.value; // Snapshot the route before calling application code.
    const target = id === null ? undefined : targets.get(id);
    const stopped = target?.present.value ? target.handle(event) : false;
    if (!stopped) handleApplicationShortcut(event);
    if (shouldPreventRuntimeCtrlC(event)) return { preventDefault: true };
  },
  { isActive: () => targets.size > 0 },
);
```

A child can inject this application-owned hub, register its handler together with `useBoxPresence(boxRef)`, remove that registration on scope disposal, and change `focused`. A reusable implementation can add nested providers, explicit traversal order, or a local `stopPropagation()` object without asking Runtime to own those policies. Only `{ preventDefault: true }` crosses back into Runtime, and only when the application wants to suppress Runtime's Ctrl+C default. This example does not promise that an `@vue-tui/use` package exists.

### Layout and Box measurement

Use the narrow fact that matches the application task:

```vue
<script setup lang="ts">
import { computed, shallowRef } from "vue";
import {
  Box,
  Text,
  useBoxPresence,
  useBoxSize,
  useLayoutWidth,
  useViewportHeight,
} from "@vue-tui/runtime";

const layoutWidth = useLayoutWidth();
const viewportHeight = useViewportHeight();

const panel = shallowRef<InstanceType<typeof Box> | null>(null);
const panelSize = useBoxSize(panel);
const panelPresence = useBoxPresence(panel);

const canCenterVertically = computed(() => viewportHeight !== null && viewportHeight.value > 20);
const graphWidth = computed(() => panelSize.value?.width ?? 24);
</script>

<template>
  <Box ref="panel" flexGrow="1">
    <Text>Root width: {{ layoutWidth }}</Text>
    <Text>Panel width: {{ graphWidth }}</Text>
    <Text>Panel is in the accepted tree: {{ panelPresence ? "yes" : "no" }}</Text>
    <Text>Can center: {{ canCenterVertically ? "yes" : "no" }}</Text>
  </Box>
</template>
```

`useLayoutWidth()` always returns a numeric readonly ref. It is the width Runtime actually gives the root layout, not an independent reading of `process.stdout.columns`. It reacts whenever a live host accepts a new layout width; string rendering uses the requested document width or 80 by default, and a stream without a usable width also falls back to 80.

`useViewportHeight()` is for code that specifically needs a finite visual row bound. It returns a readonly numeric ref on live visual Inline and Fullscreen TTY surfaces. It returns `null` at setup for an unbounded stream, screen-reader transcript, or string document. The presence or absence of that ref is fixed for the render tree; when present, its number reacts to accepted resizes. Check for `null` once instead of carrying `number | null` through every width calculation.

`useBoxSize()` accepts only a Vue ref bound directly to the exported `<Box>` component in the current vue-tui app. A raw component value, getter, non-Box target, or Box owned by another app is rejected instead of publishing a misleading size; callers that need a derived target can create a `computed()` ref themselves. The hook returns a readonly ref containing a frozen `{ width, height }` from the last accepted visual paint. Before the first accepted paint, after the target detaches, after retargeting, or while the Box is hidden, its value is `null`. A legitimate zero-sized Box is `{ width: 0, height: 0 }`, and a fully clipped Box still reports its full size. A failed output attempt or suspension does not replace the last accepted size for the same target; queued changes settle after resume and a successful repaint. Screen-reader and string rendering return `null` because they do not publish visual Box geometry.

`useBoxPresence()` accepts the same direct current-app Box ref and returns a readonly boolean ref. It is false before the first accepted live render, while the Box or one of its ancestors is hidden, after detachment, and for string rendering. It is true for a present Box even when the Box has zero size or is fully clipped, and it works for visual, non-TTY, final-output, and screen-reader live hosts. Suspension and failed candidate renders retain the last accepted value.

| Render host                                       | `useLayoutWidth()`                    | `useViewportHeight()`          | `useBoxSize()`                                   | `useBoxPresence()`          |
| ------------------------------------------------- | ------------------------------------- | ------------------------------ | ------------------------------------------------ | --------------------------- |
| Live visual Inline TTY                            | Reactive numeric layout width         | Reactive maximum visual height | `null` before paint, then accepted full Box size | Accepted live-tree presence |
| Live visual Fullscreen TTY                        | Reactive numeric viewport width       | Reactive exact viewport height | `null` before paint, then accepted full Box size | Accepted live-tree presence |
| Screen-reader transcript                          | Numeric transcript layout width       | `null`                         | `null`                                           | Accepted live-tree presence |
| Live visual non-TTY stream                        | Reactive numeric width, defaulting 80 | `null`                         | Accepted document-paint size when available      | Accepted live-tree presence |
| Final-output stream, including a TTY forced final | Fixed numeric width, defaulting 80    | `null`                         | Accepted document-paint size when available      | Accepted live-tree presence |
| Synchronous string rendering                      | Option width, defaulting 80           | `null`                         | `null`                                           | Always false                |

During suspension, the numeric layout refs and each same-target accepted Box size and presence keep their last coherent values. Resume publishes new values only with the resumed accepted layout and paint; an invalid resize pair does not replace the last coherent dimensions. After unmount, layout refs keep their final values and stop updating, while Box size becomes `null` and Box presence becomes false when the target detaches. Calling any of these hooks outside a vue-tui render tree throws.

These hooks intentionally do not expose Runtime's full render-session resolution, paint fragments, surface coordinates, clipping provenance, or renderer nodes. Runtime keeps those mechanisms internally for output, terminal-cursor placement, and mouse behavior. Application and component code gets the smaller facts it can use without depending on how Runtime implements them.

The earlier public focus-bound `useCaret()` experiment is withdrawn. Runtime still owns the private terminal cursor and its restoration, but a future public caret primitive must first define a Text-position contract that an editor can use without depending on renderer coordinates. That decision belongs to the caret and editable-text review path; no current public caret API should be inferred from the private mechanism.

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
    return;
  }
  if (event.kind === "text" && event.text === "c") {
    void selection.copy();
  }
});
</script>

<template>
  <Text ref="documentRef"
    >Select 你🙂 across <Text color="cyan">nested styles</Text> and wraps.</Text
  >
</template>
```

`move()` accepts `backward`, `forward`, `up`, `down`, `line-start`, `line-end`, `document-start`, or `document-end`, with `{ extend: true }` retaining the anchor. Movement and pointer drag stop only at complete grapheme boundaries; up/down and line commands use visual rows, while soft wraps do not insert copied newlines. `selectAll()` and `clear()` return whether they changed the selection. `copy()` returns `{ status: "empty" }` when there is no range or the range is collapsed and otherwise returns the clipboard result with the exact selected text.

Selection is built from semantic Text and successful final-paint provenance. Clipped or covered content remains part of command selection, but inverse highlighting appears only on target cells that survive final composition in the displayed frame. A failed write retains the preceding accepted mapping. Private transformed text, truncation, or another source-to-cell mapping that cannot remain exact reports `mapping-unavailable` instead of approximating. Removing or retargeting the Text clears its range; several documents may register, but only one range remains active across the app.

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

On supported non-Windows hosts, external job-control suspension is coordinated automatically. When the process receives `SIGTSTP`, vue-tui releases only the raw mode, bracketed paste, mouse level, Kitty keyboard state, cursor state, and alternate screen that Runtime acquired, then reliably stops itself with `SIGSTOP`. After `SIGCONT`, it refreshes its coherent internal dimensions when available, otherwise keeps the last coherent size. `useLayoutWidth()` and an available `useViewportHeight()` ref update with the resumed layout. Runtime then starts a fresh Inline or transcript region, transactionally re-enters and repaints Fullscreen, or repaints a live stream using its refreshed unbounded layout before restoring still-requested input modes. This does not reserve the Ctrl+Z input byte.

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

The default width is 80 columns. `columns` must be an integer from 1 through 65,535, and it is the only option; unknown keys and attempts to pass terminal mode, rows, or presentation controls fail before rendering. A document whose final visual surface exceeds 1,048,576 cells fails before Runtime allocates its paint grid. Shared components receive the deliberate document width and isolated inert streams; calling `useApp().exit()` or `useApp().waitUntilRenderFlush()` reports that the operation is unavailable.

## Links

- [vue-tui](https://github.com/vuejs-ai/vue-tui) — monorepo root
- [`@vue-tui/vite`](https://www.npmjs.com/package/@vue-tui/vite) — Vite plugin with terminal HMR
- [`@vue-tui/testing`](https://www.npmjs.com/package/@vue-tui/testing) — test harness for terminal components

## License

MIT
