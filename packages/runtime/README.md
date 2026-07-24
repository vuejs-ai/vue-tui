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

Each mounted instance remains open until its first non-empty eligible output. Only a block represented by non-empty bytes in the current settlement transaction is accepted; an output-free render leaves the instance mounted and eligible for later content, while ordinary unmount before output writes no history. Acceptance releases the slot subtree through ordinary Vue unmount lifecycle but preserves the component instance as its write-once identity, so reactive updates and keyed reorder do not replay accepted history. Remounting creates a new history block. On non-TTY output, an accepted block appends immediately before the current dynamic document is written once at clean teardown. Effective visual Fullscreen rejects `Static` before Static bytes or a replacement frame are written; keep Fullscreen history in application state, for example with a bounded `ScrollBox`. Exact simultaneous ordering, hidden-ancestor eligibility, placement and nesting rules, and failure timing remain under review.

Vue's built-in `v-show` is supported on `<Box>` roots in templates and compiled render functions. It keeps the component subtree mounted while removing hidden content from Yoga layout, paint, targeted focus availability, Box size, and Runtime-private Fullscreen hit testing. When it becomes true, the Box returns to its current layout and paint properties. This contract is deliberately Box-rooted: applying `v-show` directly to `Text` or `Static` is not supported.

Nested Text spans may nest and wrap safely. Each explicit color or modifier choice applies to its subtree, and the enclosing resolved values resume afterward; a nested `wrap` value has no independent effect because the outermost Text owns width handling for the composed content.

Runtime does not export layout conveniences as separate components. Write line breaks as text, and use an ordinary Box when a flex spacer is useful:

```vue
<Text>{{ "\n".repeat(count) }}</Text>
<Box :flexGrow="1" :flexShrink="1" />
```

## Composables

| Composable                        | Description                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `useInput(handler, opts?)`        | Frozen insertion text, complete paste payloads, and logical key identities; `isActive` gates input demand   |
| `useFocus()` / `useFocus(target)` | One explicit logical focus identity, optionally limited by a rendered component target                      |
| `useApp()`                        | In-tree exit request — `{ exit(error?) }`; host-owned lifecycle barriers stay on the app handle             |
| `useLayoutWidth()`                | Readonly reactive width Runtime gives the root layout on every host                                         |
| `useViewportHeight()`             | Readonly reactive visual viewport height, or `null` at setup when the document is not row-bounded           |
| `useBoxSize(ref)`                 | Last accepted full width and height of one directly referenced `<Box>`, or `null` when no size is available |
| `useStdin()`                      | Access the mounted stdin and independently coordinate one low-level raw-mode hold                           |

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
import { Box, Text, useBoxSize, useLayoutWidth, useViewportHeight } from "@vue-tui/runtime";

const layoutWidth = useLayoutWidth();
const viewportHeight = useViewportHeight();

const panel = shallowRef<InstanceType<typeof Box> | null>(null);
const panelSize = useBoxSize(panel);

const canCenterVertically = computed(() => viewportHeight !== null && viewportHeight.value > 20);
const graphWidth = computed(() => panelSize.value?.width ?? 24);
</script>

<template>
  <Box ref="panel" flexGrow="1">
    <Text>Root width: {{ layoutWidth }}</Text>
    <Text>Panel width: {{ graphWidth }}</Text>
    <Text>Can center: {{ canCenterVertically ? "yes" : "no" }}</Text>
  </Box>
</template>
```

`useLayoutWidth()` always returns a numeric readonly ref. It is the width Runtime actually gives the root layout, not an independent reading of `process.stdout.columns`. It reacts whenever a live host accepts a new layout width; string rendering uses the requested document width or 80 by default, and a stream without a usable width also falls back to 80.

`useViewportHeight()` is for code that specifically needs a finite visual row bound. It returns a readonly numeric ref on live Inline and Fullscreen TTY surfaces. It returns `null` at setup for an unbounded stream or string document. The presence or absence of that ref is fixed for the render tree; when present, its number reacts to accepted resizes. Check for `null` once instead of carrying `number | null` through every width calculation.

`useBoxSize()` accepts only a Vue ref bound directly to the exported `<Box>` component in the current vue-tui app. A raw component value, getter, non-Box target, or Box owned by another app is rejected instead of publishing a misleading size; callers that need a derived target can create a `computed()` ref themselves. The hook returns a readonly ref containing a frozen `{ width, height }` from the last accepted visual paint. Before the first accepted paint, after the target detaches, after retargeting, or while the Box is hidden, its value is `null`. A legitimate zero-sized Box is `{ width: 0, height: 0 }`, and a fully clipped Box still reports its full size. A failed output attempt or suspension does not replace the last accepted size for the same target; queued changes settle after resume and a successful repaint. String rendering returns `null` because it does not publish live Box geometry.

| Render host                                       | `useLayoutWidth()`                    | `useViewportHeight()`          | `useBoxSize()`                                   |
| ------------------------------------------------- | ------------------------------------- | ------------------------------ | ------------------------------------------------ |
| Live Inline TTY                                   | Reactive numeric layout width         | Reactive maximum visual height | `null` before paint, then accepted full Box size |
| Live Fullscreen TTY                               | Reactive numeric viewport width       | Reactive exact viewport height | `null` before paint, then accepted full Box size |
| Live non-TTY stream                               | Reactive numeric width, defaulting 80 | `null`                         | Accepted document-paint size when available      |
| Final-output stream, including a TTY forced final | Fixed numeric width, defaulting 80    | `null`                         | Accepted document-paint size when available      |
| Synchronous string rendering                      | Option width, defaulting 80           | `null`                         | `null`                                           |

During suspension, the numeric layout refs and each same-target accepted Box size keep their last coherent values. Resume publishes new values only with the resumed accepted layout and paint; an invalid resize pair does not replace the last coherent dimensions. After unmount, layout refs keep their final values and stop updating, while Box size becomes `null` when the target detaches. Calling any of these layout and measurement hooks outside a vue-tui render tree throws.

These hooks intentionally do not expose Runtime's full render-session resolution, paint fragments, surface coordinates, clipping provenance, or renderer nodes. Runtime keeps those mechanisms internally for output and possible future terminal interaction primitives. Application and component code gets the smaller facts it can use without depending on how Runtime implements them.

The earlier public focus-bound `useCaret()` experiment is withdrawn. Runtime still owns the private terminal cursor and its restoration, but a future public caret primitive must first define a Text-position contract that an editor can use without depending on renderer coordinates. That decision belongs to the caret and editable-text review path; no current public caret API should be inferred from the private mechanism.

### Interaction capabilities outside this foundation

Physical caret placement, targeted pointer routing, arbitrary-Text selection, and Runtime-owned clipboard transport are not public Runtime APIs in this foundation. Basic editable text and keyboard scrolling can be built from `useInput()`, Vue state, rendered glyphs, and component methods. A custom clipboard adapter is ordinary application dependency injection.

Exact terminal-caret placement, pointer hit testing and capture, and arbitrary existing Text selection need final-paint facts that application code cannot derive. The current internal mechanisms remain private implementation material while a smaller, stable Runtime-only primitive is proven. OSC 52 support is also deferred; no public `/fullscreen` interaction subpath or `MountOptions.clipboard` contract should be inferred from the private code.

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

An app instance has one real mount attempt after deterministic preflight. Invalid options or streams, a busy stdout, and an unavailable explicit Fullscreen capability throw synchronously before setup or terminal mutation and do not consume the app. Once acquisition or setup begins, the attempt is consumed: a failed `mount()` throws the original error synchronously, rollback completes, and `waitUntilExit()` rejects with that same object. Multiple mounted apps share one console patch safely; unmounting one app does not remove another app's sink.

Use `createApp(App).mount({ mode: "fullscreen" })` to render in the terminal's alternate screen. An explicit Fullscreen request requires a TTY stdout and positive terminal columns and rows; otherwise `mount()` throws synchronously without falling back to Inline. `Box` and `Text` remain passive in both modes. Because the alternate screen is a fixed application-owned viewport, Fullscreen rejects `Static`; use application state and a viewport component for retained Fullscreen content.

Omitting `mode` requests Inline. On a visual TTY, Inline keeps short output short and limits its replaceable live region to the terminal's rows and columns. A naturally over-height tree is first laid out within the available rows; non-shrinking remainder is then clipped from the bottom. Use one keyed `<Static>` instance from `@vue-tui/runtime/inline` per completed history block, or a bounded `ScrollBox`/application offset when the visible content should follow a tail or selected item. Inline never clears the main screen or scrollback as an overflow fallback. On non-TTY stdout, Inline emits no terminal-management bytes or intermediate dynamic frames: accepted Static history and coordinated console output append immediately, while clean teardown writes the current dynamic document once, adds a line ending only when non-empty output lacks one, and writes no bytes for an empty document.

Before its first visible managed output, Inline advances to a fresh terminal row so content that already occupied the current row cannot be erased by a later update. `<Static>` and patched `console.log()` / `console.error()` calls coordinate with the live region instead of corrupting it. Direct writes to `process.stdout` or a custom stream deliberately bypass Runtime's frame coordination. After a terminal resize, the old frame remains an immutable snapshot and vue-tui starts a new bounded region rather than erasing rows whose physical positions may have changed.

If an application intentionally wants to discard main-screen history, do so before mounting or after teardown. Use Fullscreen when the application needs arbitrary repaint of a stable terminal-sized viewport; Inline does not expose a mounted destructive-reset policy.

On supported non-Windows hosts, external job-control suspension is coordinated automatically. When the process receives `SIGTSTP`, vue-tui releases only the raw mode, bracketed paste, mouse level, Kitty keyboard state, cursor state, and alternate screen that Runtime acquired, then reliably stops itself with `SIGSTOP`. After `SIGCONT`, it refreshes its coherent internal dimensions when available, otherwise keeps the last coherent size. `useLayoutWidth()` and an available `useViewportHeight()` ref update with the resumed layout. Runtime then starts a fresh Inline region, transactionally re-enters and repaints Fullscreen, or repaints a live stream using its refreshed unbounded layout before restoring still-requested input modes. This does not reserve the Ctrl+Z input byte.

Normal Inline output remains on the main screen. Normal Fullscreen exit restores the previous main screen and does not replay the last viewport. Fatal exit is different: a durably painted Inline error remains visible, with a sanitized stderr report when that rich error was clipped, stdout was lost, or its first physical write failed; Fullscreen restores first and then writes the report to stderr. Final-stream fatal exit never prints a stale successful dynamic frame and writes the error to stderr.

Mount, repaint, and teardown are exception-safe transactions. Preflight resolves defaults, protocol state, mode, stdout ownership, and Fullscreen capability before mutation; acquisition then reserves stdout, establishes reverse-order rollback, installs stream observers and console protection, runs user setup, validates demanded stdin, and only then acquires terminal and input state and paints. Managed stdin is rechecked whenever demand later changes from inactive to active. Caller streams are borrowed: Runtime never ends or destroys them, removes its listeners, and restores only state it changed. Loss of active stdout or stderr work and loss of stdin while managed input is active enter the app's fatal lifecycle; input-free stdin EOF remains non-fatal. A close without an `Error` receives a stable Runtime error, a required final or restoration write can convert a clean exit into failure, and the first real cause remains authoritative while cleanup continues. An ordinary teardown or exit re-entered synchronously from a stream callback waits until the current acquisition or repaint is complete. A non-returning `process.exit()` or signal-exit callback instead restores owned terminal state immediately with synchronous writes and skips final user rendering and Vue lifecycle hooks.

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

The default width is 80 columns. The TypeScript surface is exactly `readonly columns?: number`; `columns` must be an integer from 1 through 65,535. At runtime, `renderToString()` reads only `columns` and ignores unrelated string or symbol keys without reading their values, so removed live-host fields do not become string-rendering options. A document whose final visual surface exceeds 1,048,576 cells fails before Runtime allocates its paint grid. Shared components receive the deliberate document width and isolated inert streams, and `useApp().exit()` is an inert no-op. Runtime owns the root VNode and tracks host Yoga allocations for this render, so an error during the initial Vue patch still disposes every created Vue scope and inert stream, frees the render's Yoga nodes, and rethrows the original error.

## Package subpaths

- `@vue-tui/runtime` is the common application surface.
- `@vue-tui/runtime/inline` contains only `Static`, because terminal history is meaningful only for Inline applications.
- `@vue-tui/runtime/devtools` contains only `connectDevtools()` for the official Vite integration.
- `@vue-tui/runtime/testing` contains only the low-level test-host bridge used by `@vue-tui/testing`; it gives third-party test tools the same supported access.

There is no supported `/internal` or `/fullscreen` import. Fullscreen is selected with `mount({ mode: "fullscreen" })`; private parser, renderer, terminal-protocol, mouse, selection, and clipboard mechanisms are not package contracts.

## Links

- [vue-tui](https://github.com/vuejs-ai/vue-tui) — monorepo root
- [`@vue-tui/vite`](https://www.npmjs.com/package/@vue-tui/vite) — Vite plugin with terminal HMR
- [`@vue-tui/testing`](https://www.npmjs.com/package/@vue-tui/testing) — test harness for terminal components

## License

MIT
