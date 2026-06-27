# @vue-tui/testing

> **Early stage** — under active development. Bug reports welcome, but not recommended for production use yet.

Test harness for vue-tui — render Vue 3 terminal components, simulate input, assert frames. Like `@testing-library`, but for the terminal.

[![npm version](https://img.shields.io/npm/v/@vue-tui/testing?color=%2342b883)](https://www.npmjs.com/package/@vue-tui/testing)
[![npm downloads](https://img.shields.io/npm/dm/@vue-tui/testing)](https://www.npmjs.com/package/@vue-tui/testing)

## Why

- **Isolated terminal** — renders into a fake TTY, no real terminal needed
- **Input simulation** — inject keystrokes that reach `useInput` handlers
- **Frame snapshots** — assert exact visual output with `lastFrame()` and `frames[]`
- **Auto-cleanup** — unmounts all rendered apps after each test (requires Vitest `globals: true`)

## Install

Assumes `@vue-tui/runtime` and `vue` are already installed in your project.

```bash
npm install -D @vue-tui/testing
```

## Quick Start

```tsx
import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vitest";
import { render } from "@vue-tui/testing";
import { Box, Text, useInput } from "@vue-tui/runtime";

test("counter responds to + and - keys", async () => {
  const Counter = defineComponent(() => {
    const count = shallowRef(0);
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

## API

### `render(component, options?)`

Mounts a component in a fake terminal environment. Returns a `RenderResult`.

| Option        | Type      | Default | Description                                                                                                          |
| ------------- | --------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `columns`     | `number`  | `100`   | Terminal width in columns                                                                                            |
| `rows`        | `number`  | `100`   | Terminal height in rows                                                                                              |
| `props`       | `object`  | —       | Props passed to the root component                                                                                   |
| `exitOnCtrlC` | `boolean` | `false` | Enable Ctrl+C exit handling                                                                                          |
| `interactive` | `boolean` | `true`  | Run interactively so `terminal.resize()` re-lays-out and raw mode engages. `false` to test non-interactive behavior. |

### `RenderResult`

| Property / Method        | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `lastFrame(opts?)`       | Latest rendered frame as a string                        |
| `frames`                 | Array of all captured frame snapshots                    |
| `stdin.write(data)`      | Inject input (reaches `useInput` handlers)               |
| `terminal`               | Fake terminal — `columns`, `rows`, `resize()`, `rawMode` |
| `unmount()`              | Tear down the app                                        |
| `waitUntilExit()`        | Settles when the app exits (rejects if `exit(error)`)    |
| `waitUntilRenderFlush()` | Resolves after the next render cycle completes           |

### `cleanup()`

Unmounts all rendered apps. Auto-registered as a Vitest `afterEach` hook when `globals: true` is set. Call manually if your test runner doesn't expose a global `afterEach`.

## Links

- [vue-tui](https://github.com/vuejs-ai/vue-tui) — monorepo root
- [`@vue-tui/runtime`](https://www.npmjs.com/package/@vue-tui/runtime) — the core framework
- [`@vue-tui/vite`](https://www.npmjs.com/package/@vue-tui/vite) — Vite plugin with terminal HMR

## License

MIT
