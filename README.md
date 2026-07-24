# vue-tui

> **Public beta** — the `@vue-tui/runtime` API is stabilizing toward 1.0; dev-mode HMR is still experimental. Bug reports welcome.

vue-tui is a Vue-native application framework for interactive terminal UIs.
Build with components, develop with HMR, test with confidence.

<p align="center">
  <a href="https://npmx.dev/@vue-tui/runtime"><img alt="@vue-tui/runtime npm version" src="https://img.shields.io/npm/v/@vue-tui/runtime?label=%40vue-tui%2Fruntime&color=42b883"></a>
  <a href="https://npmx.dev/@vue-tui/components"><img alt="@vue-tui/components npm version" src="https://img.shields.io/npm/v/@vue-tui/components?label=%40vue-tui%2Fcomponents&color=42b883"></a>
  <a href="https://npmx.dev/@vue-tui/vite"><img alt="@vue-tui/vite npm version" src="https://img.shields.io/npm/v/@vue-tui/vite?label=%40vue-tui%2Fvite&color=42b883"></a>
  <a href="https://npmx.dev/@vue-tui/testing"><img alt="@vue-tui/testing npm version" src="https://img.shields.io/npm/v/@vue-tui/testing?label=%40vue-tui%2Ftesting&color=42b883"></a>
</p>

- **Vue SFC & JSX** — write terminal interfaces with `<template>`, TSX, or both
- **Flexbox layout** — powered by Yoga, the same engine behind React Native
- **Dev toolkit** _(experimental)_ — **HMR** in the terminal via the `@vue-tui/vite` plugin (`npm run dev`)
- **Input and focus primitives** — normalized text, paste, and key facts with managed terminal ownership, plus explicit unique focus handles that compose with input subscriptions
- **Small public foundation** — renderer-owned facts stay public only when application code cannot derive them safely
- **Testing harness** — out-of-the-box component-level terminal testing — render, simulate input, assert frames
- **Coding-agent visual development guide** — a version-matched method for running the real app, inspecting the screen after terminal control sequences are applied, operating it, and iterating from what the agent sees ([guide](./packages/runtime/docs/visual-development-feedback-loops.md))

<p align="center">
  <a href="./examples/flappy-bird"><em>Flappy Bird</em></a> — one of the <a href="#examples">examples</a> included in the repo
  <br /><br />
  <a href="./examples/flappy-bird">
    <img src=".github/assets/flappy-bird-demo.gif" alt="Flappy Bird built with vue-tui" width="690" />
  </a>
</p>

## Quick Start

There are two ways to use vue-tui — scaffold a full project, or drop the runtime into an existing one.

### 1. Scaffold a project (recommended)

A ready-to-develop setup: Vue SFCs and a terminal HMR dev server via the `@vue-tui/vite` plugin.

```bash
npx tiged vuejs-ai/vue-tui-starter/vite my-app
cd my-app
npm install
npm run dev      # in-process terminal dev server with HMR
```

Edit `src/app.vue` and watch the terminal update instantly.

### 2. Use the runtime standalone

`@vue-tui/runtime` is a standalone Vue renderer, independent of the `@vue-tui/vite` plugin. Author components as SFCs and mount them with `createApp`, using your own build:

```vue
<!-- app.vue -->
<script setup lang="ts">
import { shallowRef } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";

const count = shallowRef(0);

useInput((event) => {
  if (event.type !== "text") return;
  // "+" is Shift+"=" on most keyboards, so accept the bare "=" too.
  if (event.text === "+" || event.text === "=") {
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
    <Text dimColor> (+/= and - to change)</Text>
  </Box>
</template>
```

```ts
// main.ts
import { createApp } from "@vue-tui/runtime";
import App from "./app.vue";

createApp(App).mount({ exitOnCtrlC: true });
```

- Compile the SFCs with [`@vitejs/plugin-vue`](https://www.npmjs.com/package/@vitejs/plugin-vue), or use JSX with [`@vitejs/plugin-vue-jsx`](https://www.npmjs.com/package/@vitejs/plugin-vue-jsx).
- For hot-reload (HMR) support while developing, add the `@vue-tui/vite` plugin: `plugins: [vue(), vueTui()]`.

## Table of Contents

- [Quick Start](#quick-start)
- [Packages](#packages)
- [Examples](#examples)
- [Components](#components)
- [High-level Components](#high-level-components)
- [Composables (Hooks)](#composables-hooks)
- [Testing](#testing)
- [Visual development with coding agents](#visual-development-with-coding-agents)
- [Development](#development)
- [Contributing](#contributing)
- [Credits](#credits)
- [License](#license)

## Packages

| Package                                                                    | Description                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@vue-tui/runtime`](https://www.npmjs.com/package/@vue-tui/runtime)       | The core framework — Vue 3 renderer for the terminal with common components (`Box`, `Text`, etc.), an explicit Inline-history subpath, narrow public layout and Box facts, normalized input, explicit unique focus ownership, lifecycle, and yoga-based flexbox layout. _API stabilizing._                         |
| [`@vue-tui/vite`](https://www.npmjs.com/package/@vue-tui/vite)             | Vite plugin — add `vueTui()` to `vite.config.ts` for an in-process terminal dev server with HMR (`npm run dev`). Dev only; the production build is a plain `tsdown` config that bundles the app into one self-contained Node file (see the starter and `examples/*/tsdown.config.ts`). _Experimental; may change._ |
| [`@vue-tui/testing`](https://www.npmjs.com/package/@vue-tui/testing)       | Deterministic test host — model terminal or stream conditions, inspect content commits, and assert the terminal-emulated screen                                                                                                                                                                                    |
| [`@vue-tui/components`](https://www.npmjs.com/package/@vue-tui/components) | High-level components built on the runtime primitives — currently `<ScrollBox>` and `<Spinner>`.                                                                                                                                                                                                                   |

## Examples

| Example                                       | Description                                                 |
| --------------------------------------------- | ----------------------------------------------------------- |
| [`basic-template`](./examples/basic-template) | Vue SFC with `<template>` syntax                            |
| [`basic-jsx`](./examples/basic-jsx)           | Same app in TSX                                             |
| [`coding-agent`](./examples/coding-agent)     | AI coding agent with LLM streaming and interactive UI       |
| [`flappy-bird`](./examples/flappy-bird)       | Physics-based terminal game with reactive state and borders |
| [`scroll-box`](./examples/scroll-box)         | Bounded viewport with app-controlled scrolling              |

## Components

| Component                        | Description                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`<Box>`](./packages/runtime)    | Terminal layout container with flex, size, spacing, border, and clipping props plus Box-rooted `v-show` |
| [`<Text>`](./packages/runtime)   | Terminal text with foreground/background color, dim, bold, wrapping, and truncation                     |
| [`<Static>`](./packages/runtime) | Commits one mounted slot tree to Inline terminal history; import from `@vue-tui/runtime/inline`         |

`Static` is deliberately absent from the common root export and has no collection API. Import the component from `@vue-tui/runtime/inline`, then use ordinary Vue iteration and stable keys when committing a list:

```vue
<Static v-for="entry in completedEntries" :key="entry.id">
  <CompletedEntry :entry="entry" />
</Static>
```

Each mounted instance remains open until its first non-empty eligible output, then commits those bytes once and releases its slot subtree through ordinary Vue unmount lifecycle. An output-free render does not consume the instance, so later content may still commit; ordinary unmount before output writes no history. Reactive changes do not rewrite accepted terminal history, while remounting creates a new block. On non-TTY output, an accepted block appends immediately before the final dynamic document is written at teardown. Effective visual Fullscreen rejects `Static`; use application-owned state and a bounded viewport there. Exact simultaneous ordering, hidden-ancestor eligibility, placement and nesting rules, and failure timing remain under review.

Vue's built-in `v-show` works on `<Box>` roots and keeps their component subtree mounted while removing hidden content from terminal layout, paint, targeted focus availability, geometry, and Fullscreen hit testing. `v-if` remains the lifecycle-owning choice, and direct `v-show` use on `Text` and `Static` roots is not supported.

Nested `<Text>` spans resolve foreground and background independently. Omitting `color` or `backgroundColor` inherits that channel from the enclosing Text; `color="default"` or `backgroundColor="default"` selects the terminal default for only that channel, and the enclosing value resumes after the subtree.

The six Text modifiers — `dimColor`, `bold`, `italic`, `underline`, `strikethrough`, and `inverse` — use a three-state cascade: omission or `undefined` inherits the enclosing value, `true` enables the modifier, and `false` disables it for that subtree; omitted outermost modifiers are disabled. `wrap` accepts exactly `"wrap"`, `"hard"`, `"truncate"`, `"truncate-middle"`, and `"truncate-start"`, defaulting to `"wrap"`. `"wrap"` prefers word boundaries but still breaks an over-wide word, `"hard"` ignores word boundaries, and the three truncation modes retain the start, both ends, or the end respectively within the final terminal-cell width. The outermost Text's `wrap` governs its complete composed content.

Runtime does not export layout conveniences as separate components. Write line breaks as text, and use an ordinary Box when a flex spacer is useful:

```vue
<Text>{{ "\n".repeat(count) }}</Text>
<Box :flexGrow="1" :flexShrink="1" />
```

`<Box>` and `<Text>` have closed prop surfaces: removed props, misspellings, browser attributes, and listener props such as `@click` and `@wheel` are rejected at runtime instead of being silently ignored. `<ScrollBox>` is also passive. Targeted pointer behavior is outside the current minimum Runtime foundation.

## High-level Components

The [`@vue-tui/components`](./packages/components) package adds higher-level components composed from the runtime primitives — published separately from the core.

| Component                              | Description                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`<ScrollBox>`](./packages/components) | Bounded sticky-bottom viewport; the app controls scrolling through its imperative handle   |
| [`<Spinner>`](./packages/components)   | Animated loading spinner — built-in `dots`/`line` presets or custom frames, optional label |

## Composables (Hooks)

| Composable                        | Description                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `useInput(handler, opts?)`        | Subscribe to normalized text, paste, and key facts; `opts.isActive` controls whether the subscription owns input resources |
| `useFocus()` / `useFocus(target)` | Create one explicit logical focus identity, optionally limited by a rendered component target                              |
| `useApp()`                        | Request normal or error exit from inside the mounted Vue tree                                                              |
| `useLayoutWidth()`                | Read the reactive numeric width Runtime gives the root layout on every host                                                |
| `useViewportHeight()`             | Read the reactive visual viewport height, or get `null` at setup when the document is not row-bounded                      |
| `useStdin()`                      | Access the mounted stdin plus an independently owned raw-mode hold for intentional low-level input                         |
| `useBoxSize(ref)`                 | Observe the last accepted full width and height of a directly referenced `<Box>`, or `null` when unavailable               |

`useInput()` delivers a frozen event with `type: "text" | "key" | "paste"`. Text contains non-empty insertion-ready `text` and may include a complete nested `key` when the terminal supplied reliable logical identity; key-only input contains a required nested `key` and no text; bracketed paste contains one complete payload, including a valid empty payload, and no key. A `key` contains exactly one normalized `name` or one logical `character`, plus `shift`, `alt`, `ctrl`, `meta`, `super`, and `hyper` booleans. Known names such as `enter`, `escape`, arrows, navigation keys, and `f1` through `f12` are suggested, while future names remain forward-compatible normalized lower-kebab-case strings. Protocol, raw sequence, parser token, codepoint, base-layout identity, lock state, key release, and unsupported input stay private.

The handler may be a direct function or a live ref to a function; Runtime resolves it when input arrives. `isActive` accepts a boolean, ref, or getter, defaults to `true`, and owns managed-input demand. Every active subscription receives the event, handler return values are ignored, and no return value consumes input or controls focus, routing, or peer delivery. Key repeat arrives as another ordinary event and key release is suppressed. `MountOptions.exitOnCtrlC` defaults to `false`, so exact Ctrl+C is normally a key event; setting it to `true` exits before delivering that key. Paste contents never trigger the option.

Every `useFocus()` call creates a distinct opaque identity in one private per-app controller. `focus()` synchronously replaces the previous owner when the handle is available, `blur()` releases that handle, and the readonly `isFocused` ref composes directly with `useInput(handler, { isActive: focus.isFocused })`. Pass no target for a logical identity whose validity follows its Vue scope, or pass a component ref when the rendered component boundary should clear focus after removal or hidden ancestry. Unavailable, disposed, and string-rendering operations are inert and never queue later acquisition; later availability never restores focus. Runtime exposes no focus manager, scope or traversal API, string lookup, automatic Tab handling, restoration, or input routing. See the [Runtime guide](./packages/runtime/README.md#focus-ownership-and-input-composition).

The app owner returned by `createApp()` exposes two coordination barriers that are intentionally absent from `useApp()`. `waitUntilRenderFlush()` is always callable: it resolves immediately before mount and after completed exit, waits for already-accepted render and output work while active, and waits for already-started teardown output without reporting the exit result. `waitUntilExit()` remains authoritative for complete restoration, accepted output, and the first fatal error, while ordinary descendants receive only the `exit(error?)` operation they need.

Component failures remain Vue failures: Runtime preserves the user's `onErrorCaptured()` and `app.config.errorHandler` policy and does not automatically exit after a later render error. Runtime still owns rollback for an error that escapes the initial consumed mount and for its own renderer, stream, input, output, and terminal failures. Console coordination defaults on, includes setup and Vue cleanup output without filtering, and uses one process-wide last-mounted-active-app stack; `patchConsole: false` leaves the process console untouched.

Physical caret placement, targeted pointer routing, arbitrary-Text selection, and Runtime-owned clipboard transport are intentionally outside this minimum public foundation. Basic editable text and keyboard scrolling can be composed from `useInput()`, Vue state, rendered glyphs, and component methods. Exact final-paint caret or selection mapping and terminal mouse ownership need a smaller Runtime-only primitive before they can be added without exposing renderer policy; operating-system or OSC 52 copy can remain an application dependency meanwhile.

Layout and measurement are deliberately split by task. `useLayoutWidth()` always returns a numeric readonly ref. `useViewportHeight()` returns a readonly numeric ref only for a finite live viewport and returns `null` once at setup for an unbounded stream or string document. `useBoxSize()` accepts a ref bound directly to `<Box>` in the current app and returns its last accepted full `{ width, height }`, or `null` before paint, while hidden or detached, and in string rendering. A non-Box or foreign-app target throws.

```ts
import { shallowRef } from "vue";
import { Box, useBoxSize, useLayoutWidth, useViewportHeight } from "@vue-tui/runtime";

const layoutWidth = useLayoutWidth();
const viewportHeight = useViewportHeight();
const panel = shallowRef<InstanceType<typeof Box> | null>(null);
const panelSize = useBoxSize(panel);
```

The broad render-session and public paint-fragment projections are not application contracts. Runtime keeps session resolution, clipping fragments, surface coordinates, and renderer nodes private, while public code consumes the narrower facts above. See [`@vue-tui/runtime`](./packages/runtime/README.md#layout-and-box-measurement) for the exact host and lifecycle behavior.

The previous focus-bound `useCaret()` contract has been withdrawn. Runtime retains terminal-cursor transport internally, but `useFocus()` does not expose physical caret placement; that capability remains outside this minimum foundation until a semantic Text-position contract is proven without exposing renderer coordinates.

There is no public input-availability hook. An active `useInput()` subscription is the gate: it acquires managed input only while `isActive` resolves to true and fails before terminal mutation when stdin is not a controllable TTY. `useStdin()` returns exactly `{ stdin, isRawModeSupported, setRawMode }` for applications that intentionally own low-level input. Each hook call has one independent idempotent raw-mode hold, surviving `true` calls do not stack, `false` releases only that call, and Vue scope disposal releases it automatically without disabling another hook or managed `useInput()` demand. Raw-only use does not attach Runtime's normalized parser, change stream encoding, or negotiate Kitty or bracketed-paste protocols; direct listeners and their cleanup belong to the caller. A non-TTY stream remains observable with no raw support, while string rendering provides an isolated inert stream that never touches `process.stdin`. Direct listeners and managed input may see the same physical bytes with no ordering, deduplication, protocol-filtering, or byte-exact composition guarantee.

## Testing

The `@vue-tui/testing` package renders components against a finite modeled host. It keeps renderer content commits (`frames` and `lastFrame()`) separate from the terminal-emulated result (`screen()`), so tests can assert the level they actually mean:

```bash
npm install -D @vue-tui/testing
```

```tsx
import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vitest";
import { render } from "@vue-tui/testing";
import { Box, Text, useInput } from "@vue-tui/runtime";

test("counter responds to + and - keys", async () => {
  const Counter = defineComponent(() => {
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
    return () => (
      <Box>
        <Text>Count: {count.value}</Text>
      </Box>
    );
  });

  const result = await render(Counter);
  expect(result.lastFrame()).toContain("Count: 0");

  await result.stdin.write("+");
  expect(result.lastFrame()).toContain("Count: 1");

  await result.stdin.write("-");
  expect(result.lastFrame()).toContain("Count: 0");

  result.dispose();
});
```

The default host is an Inline TTY. Pass `host` options to model Fullscreen, final-stream output, live stream updates, or non-TTY input. `screen().cursor` reports the emulated terminal cursor's row, column, and visibility after control bytes are applied. `unmount()` preserves the emulated screen for restoration assertions; `dispose()` performs final resource cleanup. See the [`@vue-tui/testing` package guide](./packages/testing) for the complete matrix.

## Visual development with coding agents

Content-frame assertions do not show the screen after terminal control sequences are applied, and an in-memory test host does not exercise the built application through a real PTY. vue-tui therefore ships a versioned [visual development guide](./packages/runtime/docs/visual-development-feedback-loops.md) for terminal-visible work: run the built app in a real PTY, feed its output through a declared terminal emulator, inspect both the structured active screen and a rendered image, operate the app one step at a time, and use those observations to guide the next code pass.

The method does not require a browser. It complements `@vue-tui/testing`; it does not replace deterministic component and PTY tests. The published runtime ships the guide, not a controller, PTY library, terminal emulator, or image renderer; the coding-agent environment or application project supplies those capabilities.

This repository includes a private TUI visual review tool under [`tools/tui-visual-review`](./tools/tui-visual-review). After `vp install`, run `vp run visual:basic-template` for the reference application or `vp run visual:fullscreen-origin` for the fixed-origin regression fixture. Both start an interactive JSONL session. The agent chooses states and actions from observed PNGs; this non-deterministic visual acceptance is not an image snapshot or prewritten UI test. `vp run visual:basic-template:smoke` only checks that the controller infrastructure, recorded emulator-mode cleanup, and available host restoration checks work on the current computer. The tool is a private workspace with no runtime exports or publication path.

Every `@vue-tui/runtime` installation contains the version-matched guide. From the application directory, a coding agent can locate it with:

```sh
node -p "require('node:path').join(require.resolve('@vue-tui/runtime/package.json'), '../docs/visual-development-feedback-loops.md')"
```

To make this the default in an application, put the [guide's instruction](./packages/runtime/docs/visual-development-feedback-loops.md#tell-an-agent-to-use-this-guide) in the project's root `AGENTS.md`, `CLAUDE.md`, or equivalent agent-instruction file. npm dependencies cannot make an agent read their nested documentation automatically, so the root instruction is the dependable reminder.

## Development

Requires [pnpm](https://pnpm.io/) and Node.js 22+.

```bash
pnpm install          # install dependencies
vp run ready          # lint, typecheck, test, and build (the full check)
vp run -r test        # run tests across all packages
vp run -r build       # build all packages
```

To run an example with terminal HMR, use vanilla `vite@8` (the recommended setup): `cd examples/basic-template && npm run dev`. See that example's `README.md` for the in-monorepo caveat.

## Contributing

Contributions welcome! vue-tui is evolving fast — please open an issue before starting large changes. If you use AI tools, disclose it in your PR and make sure you've reviewed and tested everything before submitting.

## Credits

vue-tui is built on the ideas pioneered by [Ink](https://github.com/vadimdemedes/ink) — component model, yoga-based layout, focus system, and rendering pipeline — adapted to Vue's philosophy. Thanks to [Vadim Demedes](https://github.com/vadimdemedes), [Sindre Sorhus](https://github.com/sindresorhus), and the [Ink contributors](https://github.com/vadimdemedes/ink/graphs/contributors).

## License

MIT
