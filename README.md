# vue-tui

Vue for the terminal. Build interactive CLI apps with components, flexbox, and HMR.

- **Vue SFC & JSX** — write terminal UIs with `<template>`, TSX, or both
- **Flexbox layout** — powered by Yoga, the same engine behind React Native
- **Focus system** — built-in focus management with Tab navigation
- **Hot module replacement** — instant feedback while developing
- **First-class testing** — render components, simulate input, assert frames

## Quick Example

```vue
<script lang="ts">
import { shallowRef, defineComponent } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";

export default defineComponent({
  components: { Box, Text },
  setup() {
    const count = shallowRef(0);

    useInput((input) => {
      if (input === "+") count.value++;
      if (input === "-") count.value--;
    });

    return { count };
  },
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

## Install

```bash
npm install @vue-tui/runtime vue
npm install -D @vue-tui/cli @vitejs/plugin-vue vite
```

## Getting Started

**`src/main.ts`**

```ts
import { createApp } from "@vue-tui/runtime";
import App from "./App.vue";

createApp(App).mount();
```

**`vite.config.ts`**

```ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    target: "node22",
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: () => "app.mjs",
    },
    rollupOptions: {
      external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0"),
    },
  },
});
```

Run in development with HMR:

```bash
npx vue-tui dev
```

Build and run:

```bash
npx vite build && node dist/app.mjs
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

## Packages

| Package                                  | Description                                                   |
| ---------------------------------------- | ------------------------------------------------------------- |
| [`@vue-tui/runtime`](./packages/runtime) | Core renderer — components, hooks, layout engine              |
| [`@vue-tui/testing`](./packages/testing) | Test harness — `render()`, frame assertions, input simulation |
| [`@vue-tui/cli`](./packages/cli)         | Dev tool — `vue-tui dev` with Vite HMR                        |

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
