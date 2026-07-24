# @vue-tui/runtime

> **Public beta** — the `@vue-tui/runtime` API is stabilizing toward 1.0; dev-mode HMR is still experimental. Bug reports welcome.

Vue 3 terminal renderer with Yoga flexbox layout — build rich TUI apps with the same component model you use on the web.

[![npm version](https://img.shields.io/npm/v/@vue-tui/runtime?color=%2342b883)](https://www.npmjs.com/package/@vue-tui/runtime)
[![npm downloads](https://img.shields.io/npm/dm/@vue-tui/runtime)](https://www.npmjs.com/package/@vue-tui/runtime)

## Why

- **Vue SFC & JSX** — `<template>`, TSX, or render functions — your choice
- **Yoga flexbox** — the same layout engine behind React Native, not a CSS-subset hack
- **Normalized input primitive** — stable text, paste, and key facts without exposing terminal-protocol details
- **Explicit focus ownership** — targetless or component-bound identities with one current owner and no public manager
- **Small public foundation** — renderer-owned facts stay public only when application code cannot derive them safely
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

createApp(App).mount({ exitOnCtrlC: true });
```

```vue
<!-- src/app.vue -->
<script setup lang="ts">
import { shallowRef } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";

const count = shallowRef(0);

useInput((event) => {
  if (event.type !== "text") return;
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

| Component  | Description                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| `<Box>`    | Terminal layout container with flex, size, spacing, border, and clipping props plus Box-rooted `v-show` |
| `<Text>`   | Terminal text with foreground/background color, dim, bold, wrapping, and truncation                     |
| `<Static>` | Commits one mounted slot tree to Inline terminal history; import from `@vue-tui/runtime/inline`         |

`Box` and `Text` have closed prop surfaces. The exported `BoxProps` type has these 46 fields:

| Purpose    | Box props                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| Flex       | `flexDirection`, `flexWrap`, `flexGrow`, `flexShrink`, `flexBasis`, `alignItems`, `alignSelf`, `justifyContent` |
| Gap        | `gap`, `rowGap`, `columnGap`                                                                                    |
| Size       | `width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`                                             |
| Position   | `position`, `top`, `right`, `bottom`, `left`                                                                    |
| Margin     | `margin`, `marginX`, `marginY`, `marginTop`, `marginRight`, `marginBottom`, `marginLeft`                        |
| Padding    | `padding`, `paddingX`, `paddingY`, `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`                 |
| Border     | `borderStyle`, `borderTop`, `borderRight`, `borderBottom`, `borderLeft`, `borderColor`                          |
| Background | `backgroundColor`                                                                                               |
| Clipping   | `overflow`, `overflowX`, `overflowY`                                                                            |

`BoxProps` deliberately has no `display` field. Use `v-if` when Vue should own creation and lifecycle, or Box-rooted `v-show` when the subtree should remain mounted while hidden.

The exported `TextProps` type has exactly nine fields: `color`, `backgroundColor`, `dimColor`, `bold`, `italic`, `underline`, `strikethrough`, `inverse`, and `wrap`. Foreground and background each accept `Color | "default"`: omission independently inherits the enclosing Text's resolved channel, while `"default"` selects that channel's terminal default for the subtree.

The six modifier props use a three-state cascade. Omission or `undefined` inherits the enclosing value, `true` enables the modifier, and `false` disables it for that subtree; omitted outermost modifiers are disabled. `wrap` accepts exactly `"wrap"`, `"hard"`, `"truncate"`, `"truncate-middle"`, and `"truncate-start"`, defaulting to `"wrap"`. `"wrap"` prefers word boundaries but still breaks an over-wide word, `"hard"` ignores word boundaries, and the truncation modes retain the start, both ends, or the end respectively. Hard line breaks are preserved, truncation operates independently on each logical line without splitting terminal graphemes, and the outermost Text's `wrap` governs its complete composed content.

`borderStyle` accepts `"single"` or `"round"`. The exported `Color` type contains the 16 canonical terminal color names and a `#${string}` arm; Runtime checks that a hex value contains exactly six hexadecimal digits.

Runtime currently has no screen-reader presentation and no `ariaLabel`, `ariaHidden`, `ariaRole`, or `ariaState` component contract. It also has no environment-variable or internal-helper path that enables the removed experiment. A future accessibility design must provide a complete semantic and terminal-output model rather than making unsupported ARIA-shaped props look effective.

Cell counts are integers from 0 through 65,535. Margins and numeric offsets use the signed range from -65,535 through 65,535; padding, gaps, dimensions, and numeric flex basis are non-negative. Flex factors are finite values from 0 through 65,535. Width and flex-basis percentages use canonical decimal text from 0% through 100%, while percentage offsets use the same grammar with an optional minus sign and a bounded absolute value. Before allocating a visual grid, Runtime also limits the final surface to 1,048,576 cells, so individually valid width and height values are not a promise that every pair can be painted.

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

Each mounted instance participates immediately and remains open until its first non-empty output. Only a block represented by non-empty bytes in the current settlement transaction is accepted; an output-free render leaves the instance open for later slot content, while ordinary unmount before output writes no history. `v-show` does not change mounted eligibility; use `v-if` when the block should not exist. Several blocks accepted in one transaction use current Vue host-tree preorder, independent of registration, mount, Yoga visual, or reverse-flex order. Later eligibility appends, accepted history never moves, and remounting creates a new block.

`Static` may appear at the application root, through components or Fragments, or inside ordinary Box structure. Its host stays outside dynamic layout flow and paints its slot as one isolated width-constrained block, so ancestor Box size, padding, flex, clipping, and display do not shape the history; put layout that belongs to the block inside its slot. Ancestor or direct `v-show` therefore has no effect on a mounted Static. Other placement and nesting combinations are unsupported and do not add public error, recovery, or normalization promises.

On non-TTY output, an accepted block appends immediately before the current dynamic document is written once at clean teardown. Effective visual Fullscreen rejects `Static` before Static bytes or a replacement frame are written; keep Fullscreen history in application state, for example with a bounded `ScrollBox`. Component errors follow Vue's ordinary error handling, and output failures follow the app's general stream and lifecycle contract; Static does not add a separate public failure protocol.

Vue's built-in `v-show` is supported on `<Box>` roots in templates and compiled render functions. It keeps the ordinary component subtree mounted while removing hidden layout content from Yoga layout, paint, targeted focus availability, and Box size. When it becomes true, the Box returns to its current layout and paint properties. Static is a mounted history boundary rather than a layout node, so ancestor or direct `v-show` does not affect its output. Applying `v-show` directly to `Text` is not supported.

Nested Text spans may nest and wrap safely. Each explicit color or modifier choice applies to its subtree, and the enclosing resolved values resume afterward; a nested `wrap` value has no independent effect because the outermost Text owns width handling for the composed content.

Runtime does not export layout conveniences as separate components. Write line breaks as text, and use an ordinary Box when a flex spacer is useful:

```vue
<Text>{{ "\n".repeat(count) }}</Text>
<Box :flexGrow="1" :flexShrink="1" />
```

## Composables

| Composable                        | Description                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `useInput(handler, opts?)`        | Frozen insertion text, complete paste payloads, and logical key identities; `isActive` gates input demand  |
| `useFocus()` / `useFocus(target)` | One explicit logical focus identity, optionally limited by a rendered component target                     |
| `useApp()`                        | In-tree exit request — `{ exit(error?) }`; host-owned lifecycle barriers stay on the app handle            |
| `useLayoutSize()`                 | Readonly reactive root-layout `width` and `height` from one accepted snapshot (`height` may be `Infinity`) |
| `useBoxMetrics(ref)`              | Readonly parent-relative `width`/`height`/`left`/`top` plus `hasMeasured` for one direct `<Box>` target    |
| `useStdin()`                      | Access the mounted stdin and independently coordinate one low-level raw-mode hold                          |

`useInput()` delivers a frozen `TuiInputEvent` discriminated by `type`. A `"text"` event contains non-empty insertion-ready `text` and may contain a complete nested `key` only when Runtime has reliable logical-key identity. A `"key"` event contains that required nested `key` and no text. A `"paste"` event contains one complete decoded bracketed-paste payload, including an empty payload, and no key. Classification is paste before text before key; opaque text and IME commits remain text without an invented key, and input with no public text, paste, or logical key fact is not delivered.

`TuiKey` contains exactly one normalized `name` or one logical `character`, plus boolean `shift`, `alt`, `ctrl`, `meta`, `super`, and `hyper` modifiers. `TuiKeyName` suggests `backspace`, `tab`, `enter`, `escape`, `insert`, `delete`, arrows, `home`, `end`, `page-up`, `page-down`, and `f1` through `f12`, but retains a string tail for future normalized lower-kebab-case semantic names. Key identity is logical rather than physical or base-layout identity. Terminal protocol, raw sequence, parser token, codepoint, base-layout identity, lock state, release phase, and unsupported input remain private.

The handler is a direct function or a live ref to one; Runtime resolves a ref with `unref()` when input arrives, so a direct function is never treated as a getter. `isActive` is an optional boolean, ref, or getter and defaults to `true`. Every active subscription receives each event, returns are ignored, and no subscription can consume input, prevent peer delivery, or control focus or routing through a result. Runtime does not promise relative handler ordering as an application routing mechanism. Repeat arrives as another ordinary input and release is not delivered. `MountOptions.exitOnCtrlC` defaults to `false`, so exact Ctrl+C is normally delivered as `{ type: "key", key: { character: "c", ctrl: true, ... } }`; `true` exits before delivering that exact key, and paste contents never trigger the option.

For intentional low-level input, `useStdin()` returns exactly `stdin: Readable`, `isRawModeSupported: boolean`, and `setRawMode(enabled): void`:

```ts
import { onScopeDispose } from "vue";
import { useStdin } from "@vue-tui/runtime";

const { stdin, isRawModeSupported, setRawMode } = useStdin();

if (isRawModeSupported) setRawMode(true);
stdin.on("data", handleLowLevelInput);

onScopeDispose(() => {
  stdin.off("data", handleLowLevelInput);
  setRawMode(false);
});
```

The stream is the exact `Readable` selected for the mount. Each hook call owns one independent idempotent logical raw-mode hold: repeated `true` does not stack, `false` releases only that call, and scope disposal releases a surviving hold automatically. Managed `useInput()` demand owns a separate hold, so neither path can disable the other. Runtime temporarily restores physical raw mode during suspension, reacquires surviving holds on resume, and restores the borrowed stream baseline during teardown.

Raw-only use does not attach Runtime's normalized parser, change the stream encoding, or negotiate Kitty or bracketed-paste protocols. The caller owns direct listeners and their cleanup. Direct stream observation and `useInput()` may see the same physical input with no safe ordering, deduplication, protocol-filtering, or byte-exact composition guarantee. A non-TTY stream remains observable while `isRawModeSupported` is false; activating managed input still fails before dispatch or terminal mutation. String rendering supplies an isolated inert `Readable`, reports no raw support, never touches `process.stdin`, and produces no input. Runtime exposes no stdin ingress, parser, route, protocol configuration, availability controller, or `useRawInput()` API.

### Focus ownership and input composition

Every `useFocus()` call creates a distinct opaque identity in one private controller owned by the mounted app. A valid `focus()` call synchronously makes that identity the only owner and replaces the previous owner; `blur()` releases it only when it is current. Both methods return `void`, and ownership is observed through the readonly `isFocused` ref.

The targetless overload creates a logical identity whose validity follows the calling Vue scope. The targeted overload accepts `FocusTarget`, a `Readonly<Ref<ComponentPublicInstance | null | undefined>>`, and additionally follows that current-app stateful component's rendered boundary. A `shallowRef()`, computed ref, or `useTemplateRef()` on Vue versions that provide it can supply the target; raw component instances and getters cannot. `null` and `undefined` are ordinary template-ref lifecycle states; a non-null value that is not a stateful component in the current app is a `TypeError`. Removing the boundary, changing its root to a Comment, detaching it, or hiding it through rendered ancestry clears ownership. A direct valid-to-valid boundary replacement in one accepted render preserves ownership. Later availability never restores either that handle or a previous owner.

```vue
<script setup lang="ts">
import { onMounted, shallowRef, type ComponentPublicInstance } from "vue";
import { Box, Text, useFocus, useInput } from "@vue-tui/runtime";

const editor = shallowRef<ComponentPublicInstance | null>(null);
const editorFocus = useFocus(editor);
const commandMode = useFocus();

onMounted(() => editorFocus.focus());

useInput(
  (event) => {
    void event; // Update the editor's application state.
  },
  {
    isActive: editorFocus.isFocused,
  },
);

function enterCommandMode() {
  commandMode.focus();
}
</script>

<template>
  <Box ref="editor">
    <Text>Editor</Text>
  </Box>
</template>
```

A targeted `focus()` call made before the component ref is available is a no-op, so ordinary focus-on-mount uses Vue's `onMounted()`. Unavailable, disposed, and string-rendering handles are inert: they do not throw, displace another owner, or queue a request for later. Targetless focus remains valid when an ancestor uses `v-show` because no rendered target was supplied. Suspend and resume preserve current ownership; target unavailability, Vue scope disposal, mount rollback, and app cleanup clear it without restoration.

`useFocus()` owns only unique identity and target validity. It does not route input or expose disabled state, automatic focus, Tab order, traversal, scopes, modal policy, a manager, string lookup, restoration, geometry, caret placement, or a focus ring. Applications and higher layers implement those policies with ordinary Vue state and compose delivery through `useInput(handler, { isActive: focus.isFocused })`; unrelated broadcast subscriptions continue to receive input.

### Layout and Box measurement

Use the narrow fact that matches the application task:

```vue
<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { Box, Text, useBoxMetrics, useLayoutSize } from "@vue-tui/runtime";

const { width: layoutWidth, height: layoutHeight } = useLayoutSize();

const panel = shallowRef<InstanceType<typeof Box> | null>(null);
const panelMetrics = useBoxMetrics(panel);

const canCenterVertically = computed(
  () => Number.isFinite(layoutHeight.value) && layoutHeight.value > 20,
);
const graphWidth = computed(() => (panelMetrics.hasMeasured.value ? panelMetrics.width.value : 24));
</script>

<template>
  <Box ref="panel" flexGrow="1">
    <Text>Root size: {{ layoutWidth }}x{{ layoutHeight }}</Text>
    <Text>Panel width: {{ graphWidth }}</Text>
    <Text>Can center: {{ canCenterVertically ? "yes" : "no" }}</Text>
  </Box>
</template>
```

`useLayoutSize()` returns `{ width, height }` as readonly reactive refs from one accepted root-layout snapshot. These are the dimensions Runtime makes available to the root layout, not raw physical terminal properties and not a component's measured rectangle. Live TTY hosts always expose finite values that update coherently on accepted resize. `renderToString()` exposes its modeled options (default 80×24); explicit `height: Infinity` means no vertical bound. The mounted non-TTY document host exposes fixed modeled 80×24 with no resize lifecycle. Physical `columns`/`rows` remain private protocol facts.

`useBoxMetrics()` accepts only a Vue ref bound directly to the exported `<Box>` in the current app. It returns readonly `width`, `height`, parent-relative `left`, parent-relative `top`, and `hasMeasured`. Before the first accepted measurement, and while the target is detached, unmounted, retargeted, or excluded by `v-show`, the four numbers are zero and `hasMeasured` is false. A real zero-sized Box reports zero size with `hasMeasured` true. Pending repaint or temporary suspension for the same target retains the last accepted values. String rendering has no live geometry service, so measurements stay unmeasured. There is no `measureElement()` or other spatial API.

| Render host                  | `useLayoutSize()`                                                  | `useBoxMetrics()`                                               |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| Live Inline TTY              | Reactive finite width and max height                               | Unmeasured until paint, then accepted parent-relative rectangle |
| Live Fullscreen TTY          | Reactive finite viewport width and height                          | Unmeasured until paint, then accepted parent-relative rectangle |
| Mounted non-TTY document     | Fixed modeled 80×24                                                | Accepted metrics when available                                 |
| Synchronous string rendering | Option width/height (default 80×24; `Infinity` allowed for height) | Unmeasured (no live geometry service)                           |

During suspension, layout refs and same-target accepted Box metrics keep their last coherent values. Resume publishes new values only with the resumed accepted layout and paint. After unmount, layout refs keep their final values and stop updating, while Box metrics clear when the target detaches. Calling these hooks outside a vue-tui render tree throws.

These hooks intentionally do not expose Runtime's full render-session resolution, paint fragments, surface coordinates, clipping provenance, or renderer nodes.

The earlier public focus-bound `useCaret()` experiment and its semantic caret controller are removed. Runtime still owns generic terminal-cursor visibility and restoration, but a future public caret primitive must first define a Text-position contract that an editor can use without depending on renderer coordinates. No current public caret API should be inferred from the generic cursor cleanup.

### Interaction capabilities outside this foundation

Physical caret placement, targeted pointer routing, arbitrary-Text selection, and Runtime-owned clipboard transport are not public Runtime APIs in this foundation. Basic editable text and keyboard scrolling can be built from `useInput()`, Vue state, rendered glyphs, and component methods. A custom clipboard adapter is ordinary application dependency injection.

Exact terminal-caret placement, pointer hit testing and capture, and arbitrary existing Text selection need final-paint facts that application code cannot derive. Their previous speculative controllers and services are removed, not retained as hidden policy. A future feature must first prove and add a smaller stable Runtime-only primitive. OSC 52 support is also deferred; no public `/fullscreen` interaction subpath or `MountOptions.clipboard` contract exists.

## App Lifecycle

```ts
import { createApp } from "@vue-tui/runtime";

// Fire and forget (most common):
createApp(App).mount();

// Wait for the app to exit:
const app = createApp(App);
app.mount();
await app.waitUntilExit();

// Explicit host choices:
const fullscreen = createApp(App);
fullscreen.mount({
  mode: "fullscreen",
  stdout,
  stdin,
  stderr,
  patchConsole: true,
  exitOnCtrlC: true,
});
```

`createApp()` returns a `TuiApp` that projects the public Vue `App` surface from the consumer's installed Vue version, excludes underscore-prefixed renderer fields and `TuiNode`, replaces Vue's DOM-oriented `mount()`, and returns the actual user root component instance. The six mount options are `stdout`, `stdin`, `stderr`, `mode`, `patchConsole`, and `exitOnCtrlC`: stdin accepts a Node `Readable`, stdout and stderr accept Node `Writable` streams, and omission selects the corresponding `process` stream. Output cadence, frame-rate tuning, renderer observation, terminal protocols, accessibility presentation, and clipboard transports are not mount policy. `patchConsole` defaults to true and `exitOnCtrlC` defaults to false.

The returned app handle owns two barriers. `waitUntilRenderFlush()` is always callable: it resolves immediately before mount and after completed exit, waits for the accepted render and output snapshot while mounted, and waits for already-started teardown output without reporting the exit result or implicitly including a later application update. `waitUntilExit()` resolves with no value after normal rollback, restoration, and accepted output, or rejects at that point with the first fatal `Error` by identity; a later stream or cleanup failure does not replace an earlier real cause, including a genuine `AggregateError`. `unmount()` starts teardown but remains synchronous; await `waitUntilExit()` when later process work depends on restoration being complete.

An app instance has one real mount attempt after deterministic preflight. Invalid options or streams, a busy stdout, and an unavailable explicit Fullscreen capability throw synchronously before setup or terminal mutation and do not consume the app. Once acquisition or setup begins, the attempt is consumed: a failed `mount()` throws the selected failure synchronously, rollback completes, and `waitUntilExit()` rejects with that same value. Runtime-owned failures are stable `Error` objects; an unhandled initial Vue component throw keeps its exact JavaScript value and is not turned into a hidden Runtime error boundary.

Live component errors remain under Vue's normal policy. Runtime does not replace `app.config.errorHandler` or add a hidden component boundary: user `onErrorCaptured()` hooks control propagation, the user's app handler keeps its identity, and a later unhandled update rejects Vue's corresponding tick without automatically exiting the Runtime application. Errors escaping the initial synchronous mount still receive complete Vue, Yoga, stream, and terminal rollback before `mount()` rethrows them.

With the default `patchConsole: true`, setup-time, mounted, update, and cleanup console output is coordinated without content filtering. All mounted apps share one physical process-console patch; the most recently mounted active app receives output, removing it reveals the previous app, and the native console methods are restored after the last registration is released. `patchConsole: false` does not touch the process console.

Use `createApp(App).mount({ mode: "fullscreen" })` to render in the terminal's alternate screen. On a live TTY, an explicit Fullscreen request requires positive terminal columns and rows; otherwise `mount()` throws synchronously. On non-TTY stdout, Inline and Fullscreen select the same non-interactive document host. `Box` and `Text` remain passive in both modes. Because the alternate screen is a fixed application-owned viewport, Fullscreen rejects `Static`; use application state and a viewport component for retained Fullscreen content.

Omitting `mode` requests Inline. On a visual TTY, Inline keeps short output short and limits its replaceable live region to the terminal's rows and columns. A naturally over-height tree is first laid out within the available rows; non-shrinking remainder is then clipped from the bottom. Use one keyed `<Static>` instance from `@vue-tui/runtime/inline` per completed history block, or a bounded `ScrollBox`/application offset when the visible content should follow a tail or selected item. Inline never clears the main screen or scrollback as an overflow fallback. On non-TTY stdout, Inline emits no terminal-management bytes or intermediate dynamic frames: accepted Static history and coordinated console output append immediately, while clean teardown writes the current dynamic document once, adds a line ending only when non-empty output lacks one, and writes no bytes for an empty document.

Before its first visible managed output, Inline advances to a fresh terminal row so content that already occupied the current row cannot be erased by a later update. `<Static>` and patched `console.log()` / `console.error()` calls coordinate with the live region instead of corrupting it. Direct writes to `process.stdout` or a custom stream deliberately bypass Runtime's frame coordination. After a terminal resize, the old frame remains an immutable snapshot and vue-tui starts a new bounded region rather than erasing rows whose physical positions may have changed.

If an application intentionally wants to discard main-screen history, do so before mounting or after teardown. Use Fullscreen when the application needs arbitrary repaint of a stable terminal-sized viewport; Inline does not expose a mounted destructive-reset policy.

On supported non-Windows hosts, external job-control suspension is coordinated automatically. When the process receives `SIGTSTP`, vue-tui releases only the raw mode, bracketed paste, Kitty keyboard state, cursor visibility, and alternate screen that Runtime acquired, then reliably stops itself with `SIGSTOP`. After `SIGCONT`, it refreshes its coherent internal dimensions when available, otherwise keeps the last coherent size. `useLayoutSize()` updates with the resumed layout snapshot. Runtime then starts a fresh Inline region, transactionally re-enters and repaints Fullscreen, or repaints a live stream before restoring still-requested input modes. This does not reserve the Ctrl+Z input byte.

Normal Inline output remains on the main screen. Normal Fullscreen exit restores the previous main screen and does not replay the last viewport. An explicit `exit(error)` or Runtime-owned output, input, renderer, or terminal failure has no hidden visual error component: teardown restores owned terminal state and writes one sanitized report to stderr. Fullscreen restores the main screen before that report, and a final-stream error exit never prints a stale successful dynamic frame.

Mount, repaint, and teardown are exception-safe transactions. Preflight resolves defaults, protocol state, mode, stdout ownership, and Fullscreen capability before mutation; acquisition then reserves stdout, establishes reverse-order rollback, installs stream observers and console protection, runs user setup, validates demanded stdin, and only then acquires terminal and input state and paints. Managed stdin is rechecked whenever demand later changes from inactive to active. Caller streams are borrowed: Runtime never ends or destroys them, removes its listeners, and restores only state it changed. Loss of active stdout or stderr work and loss of stdin while managed input is active enter the app's fatal lifecycle; input-free stdin EOF remains non-fatal. A close without an `Error` receives a stable Runtime error, a required final or restoration write can convert a clean exit into failure, and the first real cause remains authoritative while cleanup continues. An ordinary teardown or exit re-entered synchronously from a stream callback waits until the current acquisition or repaint is complete. A non-returning `process.exit()` or signal-exit callback instead restores owned terminal state immediately with synchronous writes and skips final user rendering and Vue lifecycle hooks.

> **Dev (`@vue-tui/vite`) note:** in a dev entry, prefer fire-and-forget `mount()`. The dev
> server already keeps the process alive, and a top-level `await app.waitUntilExit()` blocks the
> entry module's evaluation — which wedges Vite's HMR full-reload queue after the first reload.
> Reserve `await app.waitUntilExit()` for standalone/production entries (`node dist/main.js`).

## Render to string

Render a component as a synchronous modeled visual document without acquiring a terminal. The document has no terminal mode, input delivery, resize lifecycle, or live updates:

```ts
import { renderToString } from "@vue-tui/runtime";

const document = renderToString(App, { width: 80, height: 24 });
// Complete documents that must not clip vertically:
const full = renderToString(App, { width: 80, height: Infinity });
```

Defaults are modeled 80×24. The TypeScript surface is exactly `readonly width?: number` and `readonly height?: number`. Width must be a positive integer through 65,535. Height must be a positive integer through 65,535 or positive `Infinity` (mapped to Runtime's private unbounded representation, never passed to Yoga). Finite height bounds ordinary dynamic paint without padding shorter output. At runtime, `renderToString()` reads only those two options and ignores unrelated keys without reading their values. A document whose final visual surface exceeds 1,048,576 cells fails before Runtime allocates its paint grid. Shared components observe the same values through `useLayoutSize()` and receive isolated inert streams; `useApp().exit()` is an inert no-op. Runtime owns the root VNode and tracks host Yoga allocations for this render, so an error during the initial Vue patch still disposes every created Vue scope and inert stream, frees the render's Yoga nodes, and rethrows the original error.

Mounted non-TTY stdout is the supported secondary counterpart of this document model: Inline and Fullscreen requests share one fixed 80×24 document host with no terminal-management controls, no intermediate dynamic frames, inert `useInput()`, and a single final dynamic write on clean teardown.

## Package subpaths

- `@vue-tui/runtime` is the common application surface.
- `@vue-tui/runtime/inline` contains only `Static`, because terminal history is meaningful only for Inline applications.
- `@vue-tui/runtime/internal/devtools` is an unsupported, version-coupled bridge used only by the official `@vue-tui/vite` package (`connectDevtools(hot)`). It is not a supported public or third-party extension contract.
- `@vue-tui/runtime/internal/testing` is an unsupported, version-coupled bridge used only by the official `@vue-tui/testing` package (`createTestHostBridge()` and bridge-only types). It is not a supported public or third-party extension contract.
- `@vue-tui/runtime/package.json` is an explicit metadata export. It supports ordinary manifest resolution, including locating the version-matched visual-development guide shipped beside it, without promising that every JSON field is an independent stable API.

There is no supported broad `/internal` barrel and no `/devtools`, `/testing`, or `/fullscreen` public import. Fullscreen is selected with `mount({ mode: "fullscreen" })`; parser, renderer, and terminal-protocol mechanisms are private, while the withdrawn mouse, selection, and clipboard implementations are absent rather than hidden package contracts.

## Links

- [vue-tui](https://github.com/vuejs-ai/vue-tui) — monorepo root
- [`@vue-tui/vite`](https://www.npmjs.com/package/@vue-tui/vite) — Vite plugin with terminal HMR
- [`@vue-tui/testing`](https://www.npmjs.com/package/@vue-tui/testing) — test harness for terminal components

## License

MIT
