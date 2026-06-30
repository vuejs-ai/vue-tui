# @vue-tui/runtime

> **Public beta** — the `@vue-tui/runtime` API is stabilizing toward 1.0; dev-mode HMR is still experimental. Bug reports welcome.

Vue 3 terminal renderer with Yoga flexbox layout — build rich TUI apps with the same component model you use on the web.

[![npm version](https://img.shields.io/npm/v/@vue-tui/runtime?color=%2342b883)](https://www.npmjs.com/package/@vue-tui/runtime)
[![npm downloads](https://img.shields.io/npm/dm/@vue-tui/runtime)](https://www.npmjs.com/package/@vue-tui/runtime)

## Why

- **Vue SFC & JSX** — `<template>`, TSX, or render functions — your choice
- **Yoga flexbox** — the same layout engine behind React Native, not a CSS-subset hack
- **Built-in input system** — keyboard handling, focus management, Tab navigation
- **Terminal-native** — renders directly to stdout, purpose-built for CLI tools and AI agent interfaces

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

createApp(App).mount();
```

```vue
<!-- src/app.vue -->
<script setup lang="ts">
import { shallowRef } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";

const count = shallowRef(0);

useInput((input) => {
  if (input === "+") count.value++;
  if (input === "-") count.value--;
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
| `<Static>`    | Renders a list of items once, above the redrawn region                                         |
| `<Transform>` | Applies a string transform function to each rendered line                                      |

## Composables

| Composable                      | Description                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `useInput(handler, opts?)`      | Keyboard input — `(input, key)` with modifier and arrow key detection                        |
| `useMouseInput(handler, opts?)` | Terminal mouse input — currently SGR wheel events with ref-counted mouse-mode ownership      |
| `useFocus(opts?)`               | Component-level focus — returns `{ isFocused, focus }`                                       |
| `useFocusManager()`             | App-level focus — `focusNext()`, `focusPrevious()`, `focus(id)`                              |
| `useApp()`                      | App lifecycle — `{ exit(error?), waitUntilRenderFlush() }`                                   |
| `useWindowSize()`               | Reactive terminal dimensions — `{ columns, rows }`                                           |
| `useAnimation(opts?)`           | Frame-based animation loop — returns `{ frame, time, delta, reset }`                         |
| `useBoxMetrics(ref)`            | Reactive layout metrics — `{ width, height, left, top, hasMeasured }`                        |
| `measureElement(node)`          | Imperative read of computed `{ width, height }` from a yoga node                             |
| `useCursor()`                   | Position the terminal cursor — returns `setCursorPosition(pos)`; pass `undefined` to hide it |
| `usePaste(handler, opts?)`      | Handle clipboard paste events                                                                |
| `useStdin()`                    | Access stdin stream and raw mode control                                                     |
| `useStdout()`                   | Write directly to stdout                                                                     |
| `useStderr()`                   | Write directly to stderr                                                                     |
| `useIsScreenReaderEnabled()`    | Reactive `boolean` — whether screen-reader / accessibility mode is active                    |

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

> **Dev (`@vue-tui/vite`) note:** in a dev entry, prefer fire-and-forget `mount()`. The dev
> server already keeps the process alive, and a top-level `await app.waitUntilExit()` blocks the
> entry module's evaluation — which wedges Vite's HMR full-reload queue after the first reload.
> Reserve `await app.waitUntilExit()` for standalone/production entries (`node dist/main.js`).

## Render to String

Render a component to a single output frame without driving a live terminal — useful for snapshots, logging, or non-interactive output:

```ts
import { renderToString } from "@vue-tui/runtime";

const frame = renderToString(App); // synchronous, returns a string
```

## Links

- [vue-tui](https://github.com/vuejs-ai/vue-tui) — monorepo root
- [`@vue-tui/vite`](https://www.npmjs.com/package/@vue-tui/vite) — Vite plugin with terminal HMR
- [`@vue-tui/testing`](https://www.npmjs.com/package/@vue-tui/testing) — test harness for terminal components

## License

MIT
