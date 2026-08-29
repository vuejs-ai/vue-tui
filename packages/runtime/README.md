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

`@vue-tui/runtime` is a terminal platform renderer parallel to `@vue/runtime-dom`, comparable to [React Ink](https://github.com/vadimdemedes/ink) but adapted for Vue's reactivity model.

## Install

```bash
npm install @vue-tui/runtime vue
```

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
  if (event.type === "key") {
    if (event.key.name === "up") {
      count.value++;
    } else if (event.key.name === "down") {
      count.value--;
    }
  }
});
</script>

<template>
  <Box>
    <Text>Count: </Text>
    <Text bold color="green">{{ count }}</Text>
    <Text dimColor> (↑/↓ to change)</Text>
  </Box>
</template>
```

## Components

| Component  | Description                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `<Box>`    | Terminal layout container with flex, size, spacing, border, clipping, and `v-show`              |
| `<Text>`   | Terminal text with color, modifiers, line alignment, wrapping, truncation, and `v-show`         |
| `<Static>` | Commits one mounted slot tree to Inline terminal history; import from `@vue-tui/runtime/inline` |

`Box` and `Text` have closed prop surfaces. The exported `BoxProps` type has these 62 fields:

| Purpose           | Box props                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Flex              | `flexDirection`, `flexWrap`, `flexGrow`, `flexShrink`, `flexBasis`, `alignItems`, `alignSelf`, `alignContent`, `justifyContent`               |
| Gap               | `gap`, `rowGap`, `columnGap`                                                                                                                  |
| Size              | `width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, `aspectRatio`                                                            |
| Position          | `position`, `top`, `right`, `bottom`, `left`                                                                                                  |
| Margin            | `margin`, `marginX`, `marginY`, `marginTop`, `marginRight`, `marginBottom`, `marginLeft`                                                      |
| Padding           | `padding`, `paddingX`, `paddingY`, `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`                                               |
| Border            | `borderStyle`, `borderTop`, `borderRight`, `borderBottom`, `borderLeft`                                                                       |
| Border color      | `borderColor`, `borderTopColor`, `borderRightColor`, `borderBottomColor`, `borderLeftColor`                                                   |
| Border dim        | `borderDimColor`, `borderTopDimColor`, `borderRightDimColor`, `borderBottomDimColor`, `borderLeftDimColor`                                    |
| Border background | `borderBackgroundColor`, `borderTopBackgroundColor`, `borderRightBackgroundColor`, `borderBottomBackgroundColor`, `borderLeftBackgroundColor` |
| Background        | `backgroundColor`                                                                                                                             |
| Clipping          | `overflow`, `overflowX`, `overflowY`                                                                                                          |

The three border color channels each have one shared field plus four per-edge spellings. A per-edge value overrides the shared one on that edge only.

`BoxProps` deliberately has no `display` field. Use `v-if` when Vue should own creation and lifecycle, or `v-show` when a subtree with a single visual root should remain mounted while hidden.

The exported `TextProps` type has exactly ten fields: `color`, `backgroundColor`, `dimColor`, `bold`, `italic`, `underline`, `strikethrough`, `inverse`, `textAlign`, and `wrap`. Foreground and background each accept `Color | "default"`: omission independently inherits the enclosing Text's resolved channel, while `"default"` selects that channel's terminal default for the subtree.

The six modifier props use a three-state cascade. Omission or `undefined` inherits the enclosing value, `true` enables the modifier, and `false` disables it for that subtree; omitted outermost modifiers are disabled. `textAlign` accepts `"left"`, `"center"`, or `"right"` and defaults to `"left"`. It aligns every wrapped, truncated, or hard-newline physical line within the outermost Text's computed width using terminal display width, so wide graphemes remain centered correctly. `wrap` accepts exactly `"wrap"`, `"hard"`, `"truncate"`, `"truncate-middle"`, and `"truncate-start"`, defaulting to `"wrap"`. `"wrap"` prefers word boundaries but still breaks an over-wide word, `"hard"` ignores word boundaries, and the truncation modes retain the start, both ends, or the end respectively. Hard line breaks are preserved, truncation operates independently on each logical line without splitting terminal graphemes, and the outermost Text's `textAlign` and `wrap` govern its complete composed content.

`borderStyle` accepts one of the eight named `cli-boxes` frames — `"single"`, `"double"`, `"round"`, `"bold"`, `"singleDouble"`, `"doubleSingle"`, `"classic"`, and `"arrow"` — or a complete frame object. A frame object must supply a string for every one of `topLeft`, `top`, `topRight`, `right`, `bottomRight`, `bottom`, `bottomLeft`, and `left`, and may carry no other key: a partial frame is an error rather than a border that silently loses a side. Each character is one string, since cell width is the renderer's business. The exported `Color` type contains the 16 canonical terminal color names and a `#${string}` arm; Runtime checks that a hex value contains exactly six hexadecimal digits.

Runtime has no screen-reader presentation and no `ariaLabel`, `ariaHidden`, `ariaRole`, or `ariaState` component contract, and no environment variable or helper turns one on. A future accessibility design must provide a complete semantic and terminal-output model rather than making unsupported ARIA-shaped props look effective.

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

Vue's built-in `v-show` is implemented by the visual host layer, not by an allowlist of public components. `tui-box`, `tui-text`, and inline `tui-virtual-text` provide the display behavior Vue's directive expects. Vue therefore forwards `v-show` through any number of custom components when their current effective root resolves to one `Box` or `Text`; no custom-component registration or component-specific renderer code is needed. The first-party `Newline`, `Spacer`, `Spinner`, and `ScrollBox` follow the same rule through their Text or Box root.

Text emits exactly one host while its current vnode has a default slot, including when the slot currently returns empty content; a completely childless `<Text />` emits a Comment so it cannot introduce flex gap. Render functions may add or remove the slot on the same Text instance, and the root shape is reevaluated on every render. `v-show` keeps the ordinary component subtree mounted while excluding a hidden Box or top-level Text from Yoga layout and paint; a hidden nested Text is omitted from its enclosing Text's measurement and paint. Targeted focus bound to either hidden root becomes unavailable, and showing it again reveals the latest reactive state without restoring focus automatically.

This is Vue's normal current-root behavior rather than a vue-tui directive override. A Fragment root or text root receives Vue's non-element-root warning in development and the directive does not run. A Comment root, including a completely childless Text, is ineffective but does not produce that warning. Runtime does not intercept the directive, collect roots, or guess among descendants. `Static` is the deliberate semantic exception: it commits mounted history rather than representing retractable visual layout, so ancestor or direct `v-show` does not affect its output.

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

The handler is a direct function or a live ref to one; Runtime resolves a ref with `unref()` when input arrives, so a direct function is never treated as a getter. `isActive` is an optional boolean, ref, or getter and defaults to `true`. Every active subscription receives each event, returns are ignored, and no subscription can consume input, prevent peer delivery, or control focus or routing through a result. Every mounted `Readable` is a valid source, including a pipe: Runtime normalizes bytes that arrive. When stdin is ignored, already at EOF, or otherwise silent, no events are emitted. Raw mode is an optional enhancement rather than a subscription precondition. Runtime does not promise relative handler ordering as an application routing mechanism. Repeat arrives as another ordinary input and release is not delivered. `MountOptions.exitOnCtrlC` defaults to `false`, so exact Ctrl+C is normally delivered as `{ type: "key", key: { character: "c", ctrl: true, ... } }`; `true` exits before delivering that exact key, and paste contents never trigger the option.

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

The stream is the exact `Readable` selected for the mount. Each hook call owns one independent idempotent logical raw-mode hold: repeated `true` does not stack, `false` releases only that call, and scope disposal releases a surviving hold automatically. Managed `useInput()` demand owns a separate hold only when Runtime actually acquires an exposed raw-mode API, so neither path can disable the other. Runtime temporarily restores physical raw mode during suspension, reacquires surviving holds on resume, and restores the borrowed stream baseline during teardown.

Raw-only use does not attach Runtime's normalized parser, change the stream encoding, or negotiate Kitty or bracketed-paste protocols. The caller owns direct listeners and their cleanup. Direct stream observation and `useInput()` may see the same physical input with no safe ordering, deduplication, protocol-filtering, or byte-exact composition guarantee. On a live output host, an already-raw stream or exposed `setRawMode()` method reports raw support without requiring a separate `isTTY` claim; a stream with neither remains observable and `useInput()` still delivers any bytes it produces. The mounted document host likewise delivers available input but acquires no raw mode or negotiated input protocols. String rendering supplies an isolated inert `Readable`, reports no raw support, never touches `process.stdin`, and produces no input. Runtime exposes no stdin ingress, parser, route, protocol configuration, availability controller, or `useRawInput()` API.

### Focus ownership and input composition

Every `useFocus()` call creates a distinct opaque identity in one private controller owned by the mounted app. A valid `focus()` call synchronously makes that identity the only owner and replaces the previous owner; `blur()` releases it only when it is current. Both methods return `void`, and ownership is observed through the readonly `isFocused` ref.

The targetless overload creates a logical identity whose validity follows the calling Vue scope. The targeted overload accepts `FocusTarget`, a `Readonly<Ref<ComponentPublicInstance | null | undefined>>`, and additionally follows that current-app stateful component's rendered boundary. In an SFC, use Vue's `useTemplateRef()` so the target type is inferred from the template; render functions may instead supply a `shallowRef()`, computed ref, or another compatible readonly ref. Raw component instances and getters are not targets. `null` and `undefined` are ordinary template-ref lifecycle states; a non-null value that is not a stateful component in the current app is a `TypeError`. Removing the boundary, changing its root to a Comment, detaching it, or hiding it through rendered ancestry clears ownership. A direct valid-to-valid boundary replacement in one accepted render preserves ownership. Later availability never restores either that handle or a previous owner.

```vue
<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";
import { Box, Text, useFocus, useInput } from "@vue-tui/runtime";

const editor = useTemplateRef("editor");
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
import { computed, useTemplateRef } from "vue";
import { Box, Text, useBoxMetrics, useLayoutSize } from "@vue-tui/runtime";

const { width: layoutWidth, height: layoutHeight } = useLayoutSize();

const panel = useTemplateRef("panel");
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

Runtime owns generic terminal-cursor visibility and restoration and exposes no public caret API. A future public caret primitive must first define a Text-position contract that an editor can use without depending on renderer coordinates.

### Interaction capabilities outside this foundation

Physical caret placement, targeted pointer routing, arbitrary-Text selection, and Runtime-owned clipboard transport are not public Runtime APIs in this foundation. Basic editable text and keyboard scrolling can be built from `useInput()`, Vue state, rendered glyphs, and component methods. A custom clipboard adapter is ordinary application dependency injection.

Exact terminal-caret placement, pointer hit testing and capture, and arbitrary existing Text selection need final-paint facts that application code cannot derive, and Runtime provides none of them, publicly or privately. A future feature must first prove and add a smaller stable Runtime-only primitive. OSC 52 support is also deferred; no public `/fullscreen` interaction subpath or `MountOptions.clipboard` contract exists.

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

`createApp()` returns a `TuiApp` that projects the public Vue `App` surface from the consumer's installed Vue version, excludes underscore-prefixed renderer fields and `TuiNode`, replaces Vue's DOM-oriented `mount()`, and returns the actual user root component instance. The seven mount options are `stdout`, `stdin`, `stderr`, `mode`, `color`, `patchConsole`, and `exitOnCtrlC`: stdin accepts a Node `Readable`, stdout and stderr accept Node `Writable` streams, and omission selects the corresponding `process` stream. `color` accepts `boolean | ColorProfile`, where `ColorProfile` is `"ansi16" | "ansi256" | "truecolor"`. Omission and `true` automatically resolve styling once against the selected stdout: explicit `FORCE_COLOR` wins, non-empty `NO_COLOR` / `NODE_DISABLE_COLORS` suppress colors while retaining non-color attributes on a capable TTY, and otherwise Runtime uses that stream's TTY color depth. `false` emits no SGR styling, while an explicit profile forces that capability and ignores environment, TTY state, and detected depth. The result applies to component props and SGR already present in Text content: plain output strips it, `NO_COLOR` strips only its colors, and lower profiles reduce higher color forms. Output cadence, frame-rate tuning, renderer observation, terminal protocols, accessibility presentation, and clipboard transports are not mount policy. `patchConsole` defaults to true and `exitOnCtrlC` defaults to false.

The returned app handle owns two barriers. `waitUntilRenderFlush()` is always callable: it resolves immediately before mount and after completed exit, waits for the accepted render and output snapshot while mounted, and waits for already-started teardown output without reporting the exit result or implicitly including a later application update. `waitUntilExit()` resolves with no value after normal rollback, restoration, and accepted output, or rejects at that point with the first fatal `Error` by identity; a later stream or cleanup failure does not replace an earlier real cause, including a genuine `AggregateError`. `unmount()` starts teardown but remains synchronous; await `waitUntilExit()` when later process work depends on restoration being complete.

An app instance has one real mount attempt after deterministic preflight. Invalid options or streams, a busy stdout, and an unavailable explicit Fullscreen capability throw synchronously before setup or terminal mutation and do not consume the app. Once acquisition or setup begins, the attempt is consumed: a failed `mount()` throws the selected failure synchronously, rollback completes, and `waitUntilExit()` rejects with that same value. Runtime-owned failures are stable `Error` objects; an unhandled initial Vue component throw keeps its exact JavaScript value and is not turned into a hidden Runtime error boundary.

Live component errors remain under Vue's normal policy. Runtime does not replace `app.config.errorHandler` or add a hidden component boundary: user `onErrorCaptured()` hooks control propagation, the user's app handler keeps its identity, and a later unhandled update rejects Vue's corresponding tick without automatically exiting the Runtime application. Errors escaping the initial synchronous mount still receive complete Vue, Yoga, stream, and terminal rollback before `mount()` rethrows them.

With the default `patchConsole: true`, setup-time, mounted, update, and cleanup console output is coordinated without content filtering. All mounted apps share one physical process-console patch; the most recently mounted active app receives output, removing it reveals the previous app, and the native console methods are restored after the last registration is released. `patchConsole: false` does not touch the process console.

Use `createApp(App).mount({ mode: "fullscreen" })` to render in the terminal's alternate screen. On a live TTY, an explicit Fullscreen request requires positive terminal columns and rows; otherwise `mount()` throws synchronously. On non-TTY stdout, Inline and Fullscreen select the same non-interactive document host. `Box` and `Text` remain passive in both modes. Because the alternate screen is a fixed application-owned viewport, Fullscreen rejects `Static`; use application state and a viewport component for retained Fullscreen content.

Omitting `mode` requests Inline. On a visual TTY, Inline keeps short output short and limits its replaceable live region to the terminal's rows and columns. A tree taller than the terminal keeps its natural height and the live region shows its trailing terminal-sized window, so the newest rows stay visible; the rows above that window are not written. Content is never compressed to fit. Use one keyed `<Static>` instance from `@vue-tui/runtime/inline` per completed history block, or a bounded `ScrollBox`/application offset when the visible content should follow a tail or selected item. Inline never clears the main screen or scrollback as an overflow fallback. On non-TTY stdout, Inline emits no terminal-management bytes or intermediate dynamic frames: accepted Static history and coordinated console output append immediately, while clean teardown writes the current dynamic document once, adds a line ending only when non-empty output lacks one, and writes no bytes for an empty document.

Before its first visible managed output, Inline advances to a fresh terminal row so content that already occupied the current row cannot be erased by a later update. `<Static>` and patched `console.log()` / `console.error()` calls coordinate with the live region instead of corrupting it. Direct writes to `process.stdout` or a custom stream deliberately bypass Runtime's frame coordination. After a terminal resize, the old frame remains an immutable snapshot and vue-tui starts a new bounded region rather than erasing rows whose physical positions may have changed.

If an application intentionally wants to discard main-screen history, do so before mounting or after teardown. Use Fullscreen when the application needs arbitrary repaint of a stable terminal-sized viewport; Inline does not expose a mounted destructive-reset policy.

On supported non-Windows hosts, external job-control suspension is coordinated automatically. When the process receives `SIGTSTP`, vue-tui releases only the raw mode, bracketed paste, Kitty keyboard state, cursor visibility, and alternate screen that Runtime acquired, then reliably stops itself with `SIGSTOP`. After `SIGCONT`, it refreshes its coherent internal dimensions when available, otherwise keeps the last coherent size. `useLayoutSize()` updates with the resumed layout snapshot. Runtime then starts a fresh Inline region, transactionally re-enters and repaints Fullscreen, or repaints a live stream before restoring still-requested input modes. This does not reserve the Ctrl+Z input byte.

Normal Inline output remains on the main screen. Normal Fullscreen exit restores the previous main screen and does not replay the last viewport. An explicit `exit(error)` or Runtime-owned output, input, renderer, or terminal failure has no hidden visual error component: teardown restores owned terminal state and writes one sanitized report to stderr. Fullscreen restores the main screen before that report, and a final-stream error exit never prints a stale successful dynamic frame.

Mount, repaint, and teardown are exception-safe transactions. Preflight resolves defaults, protocol state, mode, stdout ownership, and Fullscreen capability before mutation; acquisition then reserves stdout, establishes reverse-order rollback, installs stream observers and console protection, runs user setup, attaches demanded stdin parsing, conditionally acquires exposed raw-mode and input-protocol resources, and paints. The same optional acquisition runs whenever demand later changes from inactive to active. Caller streams are borrowed: Runtime never ends or destroys them, removes its listeners, and restores only state it changed. Loss of active stdout or stderr work and an actual stdin `error` while managed input is active enter the app's fatal lifecycle; normal stdin end or close simply ends future input delivery. A lost output stream without an `Error` receives a stable Runtime error, a required final or restoration write can convert a clean exit into failure, and the first real cause remains authoritative while cleanup continues. An ordinary teardown or exit re-entered synchronously from a stream callback waits until the current acquisition or repaint is complete. A non-returning `process.exit()` or signal-exit callback instead restores owned terminal state immediately with synchronous writes and skips final user rendering and Vue lifecycle hooks.

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

Defaults are modeled 80×24 with plain styling. The TypeScript surface is exactly `readonly width?: number`, `readonly height?: number`, and `readonly color?: boolean | ColorProfile`. Width must be a positive integer through 65,535. Height must be a positive integer through 65,535 or positive `Infinity` (mapped to Runtime's private unbounded representation, never passed to Yoga). `false` is the default and emits no SGR styling, including SGR authored directly in Text content. A profile selects and enforces the same fixed capability as mounted rendering; explicit `true` uses the same automatic resolver as mount against `process.stdout` and `process.env`. The string host still writes nothing to that stream and exposes only isolated inert streams to components. Finite height bounds ordinary dynamic paint without padding shorter output. At runtime, `renderToString()` reads only the three public options and ignores unrelated keys without reading their values. A document whose final visual surface exceeds 1,048,576 cells fails before Runtime allocates its paint grid. Shared components observe the same dimensions through `useLayoutSize()` and receive isolated inert streams; `useApp().exit()` is an inert no-op. Runtime owns the root VNode and tracks host Yoga allocations for this render, so an error during the initial Vue patch still disposes every created Vue scope and inert stream, frees the render's Yoga nodes, and rethrows the original error.

Mounted non-TTY stdout is the supported secondary counterpart of this document model: Inline and Fullscreen requests share one fixed 80×24 document host with no terminal-management controls, no intermediate dynamic frames, inert `useInput()`, and a single final dynamic write on clean teardown.

## Package subpaths

- `@vue-tui/runtime` is the common application surface.
- `@vue-tui/runtime/inline` contains only `Static`, because terminal history is meaningful only for Inline applications.
- `@vue-tui/runtime/internal/devtools` is an unsupported, version-coupled bridge used only by the official `@vue-tui/vite` package (`connectDevtools(hot)`). It is not a supported public or third-party extension contract.
- `@vue-tui/runtime/internal/testing` is an unsupported, version-coupled bridge used only by the official `@vue-tui/testing` package (`createTestHostBridge()` and bridge-only types). It is not a supported public or third-party extension contract.
- `@vue-tui/runtime/package.json` is an explicit metadata export for ordinary manifest resolution without promising that every JSON field is an independent stable API.

There is no supported broad `/internal` barrel and no `/devtools`, `/testing`, or `/fullscreen` public import. Fullscreen is selected with `mount({ mode: "fullscreen" })`; parser, renderer, and terminal-protocol mechanisms are private, while the withdrawn mouse, selection, and clipboard implementations are absent rather than hidden package contracts.

## Links

- [vue-tui](https://github.com/vuejs-ai/vue-tui) — monorepo root
- [`@vue-tui/vite`](https://www.npmjs.com/package/@vue-tui/vite) — Vite plugin with terminal HMR
- [`@vue-tui/testing`](https://www.npmjs.com/package/@vue-tui/testing) — test harness for terminal components

## License

MIT
