# @vue-tui/testing

Test harness for [`@vue-tui/runtime`](../runtime).

## Install

```bash
pnpm add -D @vue-tui/testing vue
```

## Quickstart

```ts
import { defineComponent, h } from "vue";
import { test, expect } from "vitest";
import { render, flush } from "@vue-tui/testing";
import { Text } from "@vue-tui/runtime";

test("renders hello", async () => {
  const App = defineComponent({ render: () => h(Text, null, "hello") });
  const r = render(App);
  await flush();
  expect(r.lastFrame()).toContain("hello");
  r.unmount();
});
```

## API

- **`render(app, { columns?, rows? })`** — mount in a fake-TTY environment, collect frames.
- **`flush()`** — await Vue's post-flush queue + Node's immediate queue.
- **`result.lastFrame()` / `result.frames`** — frame snapshots.
- **`result.stdin.write(data)`** — inject input that reaches `useInput` handlers.
- **`result.app`** — the underlying [`TuiApp`](../runtime/README.md#tuiapp-interface) (use `.waitUntilExit()` if needed).
- **`result.unmount()` / `result.waitUntilExit()`** — convenience pass-throughs.
