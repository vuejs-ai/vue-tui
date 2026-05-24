# vue-tui

> **Early stage** — under active development. Bug reports welcome, but not recommended for production use yet.

Vue for the terminal. Build interactive CLI apps with components, flexbox, and HMR.

- **Vue SFC & JSX** — write terminal UIs with `<template>`, TSX, or both
- **Flexbox layout** — powered by Yoga, the same engine behind React Native
- **Focus system** — built-in focus management with Tab navigation
- **Hot module replacement** — instant feedback while developing
- **First-class testing** — render components, simulate input, assert frames

## Packages

- **[`@vue-tui/runtime`](./packages/runtime)** — The core framework. A custom Vue 3 renderer that targets the terminal instead of the DOM. Provides components (`Box`, `Text`, `Static`, etc.), composables (`useInput`, `useFocus`, `useExit`, etc.), and a yoga-based flexbox layout engine.
- **[`@vue-tui/cli`](./packages/cli)** — Development tool. Run `vue-tui dev` to start your app with Vite-powered HMR — edit a `.vue` file and see the terminal update instantly.
- **[`@vue-tui/testing`](./packages/testing)** — Test harness. Render components in an isolated fake terminal, simulate keyboard input, and assert on visual output frame by frame.

## Quick Example

```ts
// src/main.ts
import { createApp } from "@vue-tui/runtime";
import App from "./App.vue";

createApp(App).mount();
```

```vue
<!-- src/App.vue -->
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
    <!-- try changing this color -->
    <Text dimColor> (+/- to change)</Text>
  </Box>
</template>
```

## Getting Started

```bash
npx tiged vuejs-ai/vue-tui-starter my-app
cd my-app
npm install
npm run dev
```

That's it — try changing the color or text in `App.vue` and watch the terminal update instantly while keeping your component state.

To build and run:

```bash
npm run preview
```

## Components

| Component                           | Description                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`<Box>`](./packages/runtime)       | Flexbox container — direction, wrap, align, justify, gap, padding, margin, borders, background |
| [`<Text>`](./packages/runtime)      | Styled text — color, bold, italic, underline, strikethrough, dimColor, wrap/truncate modes     |
| [`<Spacer>`](./packages/runtime)    | Expands to fill available space (`flex-grow: 1`)                                               |
| [`<Newline>`](./packages/runtime)   | Inserts line breaks (configurable `count`)                                                     |
| [`<Static>`](./packages/runtime)    | Renders a list of items once, above the redrawn region                                         |
| [`<Transform>`](./packages/runtime) | Applies a string transform function to each rendered line                                      |

## Hooks

| Hook                       | Description                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `useInput(handler, opts?)` | Handle keyboard input — receives `(input, key)` with modifier and arrow key detection |
| `useFocus(opts?)`          | Component-level focus — returns `{ isFocused, focus }`                                |
| `useFocusManager()`        | App-level focus control — `focusNext()`, `focusPrevious()`, `focus(id)`               |
| `useExit()`                | Programmatic app exit — returns `exit(error?)`                                        |
| `useTerminalSize()`        | Reactive terminal dimensions — `{ columns, rows }`                                    |
| `useStdin()`               | Access stdin stream and raw mode control                                              |
| `useStdout()`              | Write directly to stdout                                                              |
| `useStderr()`              | Write directly to stderr                                                              |

## Testing

The `@vue-tui/testing` package renders components in an isolated environment and lets you simulate input and assert visual output:

```bash
npm install -D @vue-tui/testing
```

```tsx
import { defineComponent, ref } from "vue";
import { expect, test } from "vitest";
import { render } from "@vue-tui/testing";
import { Box, Text, useInput } from "@vue-tui/runtime";

test("counter responds to + and - keys", async () => {
  const Counter = defineComponent(() => {
    const count = ref(0);
    useInput((input) => {
      if (input === "+") count.value++;
      if (input === "-") count.value--;
    });
    return () => (
      <Box>
        <Text>Count: {count.value}</Text>
      </Box>
    );
  });

  const { lastFrame, stdin } = await render(Counter);
  expect(lastFrame()).toContain("Count: 0");

  await stdin.write("+");
  expect(lastFrame()).toContain("Count: 1");

  await stdin.write("-");
  expect(lastFrame()).toContain("Count: 0");
});
```

## Examples

| Example                                       | Description                                        |
| --------------------------------------------- | -------------------------------------------------- |
| [`basic-template`](./examples/basic-template) | Vue SFC with `<template>` syntax                   |
| [`basic-jsx`](./examples/basic-jsx)           | Same app in TSX                                    |
| [`flappy-bird`](./examples/flappy-bird)       | Physics-based game with reactive state and borders |

## Development

Requires [pnpm](https://pnpm.io/) and Node.js 22+.

```bash
pnpm install          # install dependencies
vp run ready          # lint, typecheck, test, and build (the full check)
vp run -r test        # run tests across all packages
vp run -r build       # build all packages
vue-tui dev           # start an example with HMR
```

## Credits

vue-tui started as a Vue port of [Ink](https://github.com/vadimdemedes/ink), the library that proved terminal UIs could be built with the same component patterns we use on the web. The component model, yoga-based layout, focus system, rendering pipeline — all of it originates in Ink's design, adapted to follow Vue's philosophy and conventions. Thank you to [Vadim Demedes](https://github.com/vadimdemedes), [Sindre Sorhus](https://github.com/sindresorhus), and the [Ink contributors](https://github.com/vadimdemedes/ink/graphs/contributors) for creating such a solid foundation.

## License

MIT
