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
- [`@vue-tui/runtime`](#vue-tuiruntime)
- [`@vue-tui/components`](#vue-tuicomponents)
- [`@vue-tui/testing`](#vue-tuitesting)
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
| [`@vue-tui/components`](https://www.npmjs.com/package/@vue-tui/components) | High-level components built on the runtime primitives — `<ScrollBox>`, `<Spinner>`, `<Newline>`, and `<Spacer>`.                                                                                                                                                                                                   |

## Examples

| Example                                       | Description                                                 |
| --------------------------------------------- | ----------------------------------------------------------- |
| [`basic-template`](./examples/basic-template) | Vue SFC with `<template>` syntax                            |
| [`basic-jsx`](./examples/basic-jsx)           | Same app in TSX                                             |
| [`coding-agent`](./examples/coding-agent)     | AI coding agent with LLM streaming and interactive UI       |
| [`flappy-bird`](./examples/flappy-bird)       | Physics-based terminal game with reactive state and borders |
| [`scroll-box`](./examples/scroll-box)         | Bounded viewport with app-controlled scrolling              |

## `@vue-tui/runtime`

The core renderer: the terminal primitives and the composables that read
renderer-owned facts. [Package guide](./packages/runtime).

### Components

| Component  | Description                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `<Box>`    | Layout container — flex, size, spacing, border, background, clipping, plus Box-rooted `v-show` |
| `<Text>`   | Text — foreground/background color, six modifiers, wrapping, truncation                        |
| `<Static>` | Commits a mounted subtree to Inline terminal history; import from `@vue-tui/runtime/inline`    |

`Box` and `Text` have closed prop surfaces: unknown props, misspellings, browser attributes, and listeners such as `@click` are rejected at runtime instead of silently ignored. The full prop tables are in the [Runtime guide](./packages/runtime/README.md#components).

`Static` is absent from the root export and has no collection API — use ordinary Vue iteration with stable keys. Each instance commits its output once and then releases its subtree; effective Fullscreen rejects `Static`.

```vue
<Static v-for="entry in completedEntries" :key="entry.id">
  <CompletedEntry :entry="entry" />
</Static>
```

### Composables

Each one must be called inside a mounted render tree.

| Composable                 | Returns                                     | Description                                                                    |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| `useInput(handler, opts?)` | —                                           | Normalized text, paste, and key events; `opts.isActive` gates the subscription |
| `useFocus(target?)`        | `{ isFocused, focus, blur }`                | One explicit focus identity, optionally bound to a rendered component          |
| `useApp()`                 | `{ exit }`                                  | Request normal or error exit from inside the tree                              |
| `useLayoutSize()`          | `{ width, height }`                         | Readonly reactive root-layout size; `height` may be `Infinity`                 |
| `useStdin()`               | `{ stdin, isRawModeSupported, setRawMode }` | Mounted stdin plus an independently owned raw-mode hold                        |
| `useBoxMetrics(ref)`       | `{ width, height, left, top, hasMeasured }` | Parent-relative metrics for one directly referenced `<Box>`                    |

`useInput()` delivers one frozen event per input:

| `event.type` | Payload                                                                            |
| ------------ | ---------------------------------------------------------------------------------- |
| `"text"`     | Non-empty `text`, plus a nested `key` when the terminal supplied reliable identity |
| `"key"`      | A required nested `key` and no text                                                |
| `"paste"`    | One complete payload, possibly empty, and no key                                   |

A `key` carries exactly one normalized `name` or one logical `character`, plus `shift`, `alt`, `ctrl`, `meta`, `super`, and `hyper` booleans.

Every active subscription receives every event and handler return values are ignored, so nothing consumes input or steers routing. Focus composes directly as `useInput(handler, { isActive: focus.isFocused })`. See the [Runtime guide](./packages/runtime/README.md#composables) for ownership and lifecycle rules.

`useApp()` intentionally exposes only `exit()`; the coordination barriers `waitUntilExit()` and `waitUntilRenderFlush()` belong to the app owner returned by `createApp()`. Component failures stay Vue failures — Runtime preserves your `onErrorCaptured()` and `app.config.errorHandler` policy. See [App Lifecycle](./packages/runtime/README.md#app-lifecycle).

## `@vue-tui/components`

Higher-level components composed only from the primitives above, published
separately so the core stays small. [Package guide](./packages/components).

| Component     | Description                                                                            |
| ------------- | -------------------------------------------------------------------------------------- |
| `<ScrollBox>` | Bounded sticky-bottom viewport; the app drives scrolling through its imperative handle |
| `<Spinner>`   | Animated loading spinner — `dots` / `line` presets or custom frames, optional label    |
| `<Newline>`   | Emits `count` newline characters inside a `<Text>`                                     |
| `<Spacer>`    | A growing `Box` that fills the free main-axis space                                    |

## `@vue-tui/testing`

Renders against a finite modeled host, keeping renderer content commits (`frames`, `lastFrame()`) separate from the terminal-emulated result (`screen()`) so a test asserts the level it actually means.

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

`render(component, options?)` takes a flat options object; omitting it models an Inline TTY.

| Option         | Default    | Description                                     |
| -------------- | ---------- | ----------------------------------------------- |
| `mode`         | `"inline"` | Production screen model to reproduce            |
| `stdin`        | `"tty"`    | `"tty"` or `"non-tty"`                          |
| `stdout`       | `"tty"`    | `"tty"` or `"stream"`                           |
| `columns`      | `100`      | Layout and emulator width                       |
| `rows`         | `100`      | Emulator and TTY height                         |
| `patchConsole` | `false`    | Route console output through the modeled writer |
| `exitOnCtrlC`  | `false`    | Exit before delivering an exact Ctrl+C key      |
| `props`        | —          | Props passed to the component under test        |

`render()` resolves to a `RenderResult`:

| Member                                       | Description                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `frames`                                     | Every renderer content commit                                                                    |
| `lastFrame(options?)`                        | The most recent content commit                                                                   |
| `screen()`                                   | Emulated terminal state after queued output; `screen().cursor` gives row, column, and visibility |
| `stdin.write(data)`                          | Feed input to the app                                                                            |
| `terminal`                                   | `columns`, `rows`, `resize()`, `suspend()`, `resume()`, `rawMode`                                |
| `unmount()`                                  | Tear down the app, keeping the emulated screen readable for restoration assertions               |
| `dispose()`                                  | Idempotently tear down and release every test-host resource                                      |
| `waitUntilExit()` / `waitUntilRenderFlush()` | App-owner barriers                                                                               |

See the [`@vue-tui/testing` package guide](./packages/testing) for the complete matrix.

## Development

Requires [pnpm](https://pnpm.io/) and Node.js 22+.

```bash
pnpm install          # install dependencies
vp run ready          # lint, typecheck, test, and build (the full check)
vp run -r test        # run tests across all packages
vp run -r build       # build all packages
```

For terminal-visible changes, this repository has a TUI visual review tool: `vp run visual:basic-template` (or `vp run visual:fullscreen-origin`) starts an interactive session where the agent inspects rendered screenshots. See [`tools/tui-visual-review`](./tools/tui-visual-review).

To run an example with terminal HMR, use vanilla `vite@8` (the recommended setup): `cd examples/basic-template && npm run dev`. See that example's `README.md` for the in-monorepo caveat.

## Contributing

Contributions welcome! vue-tui is evolving fast — please open an issue before starting large changes. If you use AI tools, disclose it in your PR and make sure you've reviewed and tested everything before submitting.

## Credits

vue-tui is built on the ideas pioneered by [Ink](https://github.com/vadimdemedes/ink) — component model, yoga-based layout, focus system, and rendering pipeline — adapted to Vue's philosophy. Thanks to [Vadim Demedes](https://github.com/vadimdemedes), [Sindre Sorhus](https://github.com/sindresorhus), and the [Ink contributors](https://github.com/vadimdemedes/ink/graphs/contributors).

## License

MIT
