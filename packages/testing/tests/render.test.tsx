import { nextTick, ref } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "../src/index.ts";
import { Text } from "@vue-tui/runtime";

test("lastFrame captures rendered output", async () => {
  const { lastFrame } = await render(() => <Text>hello</Text>);
  expect(lastFrame()).toContain("hello");
});

test("frames accumulate on reactive updates", async () => {
  const message = ref("first");
  const { lastFrame, frames } = await render(() => <Text>{message.value}</Text>);
  const initialCount = frames.length;
  expect(lastFrame()).toContain("first");

  message.value = "second";
  await nextTick();
  expect(lastFrame()).toContain("second");
  expect(frames.length).toBeGreaterThan(initialCount);
});

test("render with custom columns", async () => {
  const { lastFrame } = await render(() => <Text>hello</Text>, { columns: 20 });
  expect(lastFrame()).toContain("hello");
});

test("lastFrame trims trailing whitespace", async () => {
  const { lastFrame } = await render(() => <Text>hi</Text>);
  const frame = lastFrame()!;
  for (const line of frame.split("\n")) {
    expect(line).toBe(line.trimEnd());
  }
});

test("auto cleanup — no manual unmount needed", async () => {
  const { lastFrame } = await render(() => <Text>auto</Text>);
  expect(lastFrame()).toContain("auto");
});
