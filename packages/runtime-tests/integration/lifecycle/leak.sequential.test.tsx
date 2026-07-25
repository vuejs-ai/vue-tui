// Sequential: asserts on process-global listener counts (process exit/SIGINT/
// beforeExit). Concurrent siblings that mount/unmount apps add and remove those
// listeners, polluting the counts. Tests are it.sequential.

import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, createApp, Text, useInput } from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

test.sequential("50 render/unmount cycles leak zero process listeners", async () => {
  const exitBefore = process.listenerCount("exit");
  const sigintBefore = process.listenerCount("SIGINT");

  const App = defineComponent(() => () => <Text>x</Text>);

  for (let i = 0; i < 50; i++) {
    const { unmount } = await render(App);
    unmount();
  }

  expect(process.listenerCount("exit")).toBe(exitBefore);
  expect(process.listenerCount("SIGINT")).toBe(sigintBefore);
});

test.sequential("100 render/unmount cycles complete without throw and allow remount", async () => {
  const App = defineComponent(() => () => <Text>x</Text>);

  for (let i = 0; i < 100; i++) {
    const { unmount } = await render(App);
    unmount();
  }

  // Behavioral check: a fresh mount after many cycles still works.
  const { unmount, lastFrame } = await render(App);
  expect(lastFrame()).toContain("x");
  unmount();
});

test.sequential("raw mode stays on when one of two useInput components unmounts", async () => {
  const showB = shallowRef(true);

  const Listener = defineComponent(() => {
    useInput(() => undefined);
    return () => <Text>x</Text>;
  });

  const App = defineComponent(() => {
    return () => (
      <Box>
        <Listener />
        {showB.value ? <Listener /> : null}
      </Box>
    );
  });

  const { terminal } = await render(App);
  expect(terminal.rawMode.current).toBe(true);

  showB.value = false;
  await nextTick();
  expect(terminal.rawMode.current).toBe(true);
});

test.sequential("mount owns one beforeExit listener until unmount", async () => {
  const App = defineComponent(() => () => <Text>Hello</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const beforeMountCount = process.listenerCount("beforeExit");

  app.mount({ stdout, stdin, stderr });
  expect(process.listenerCount("beforeExit")).toBe(beforeMountCount + 1);

  app.unmount();
  expect(process.listenerCount("beforeExit")).toBe(beforeMountCount);

  await expect(app.waitUntilRenderFlush()).resolves.toBeUndefined();
  expect(process.listenerCount("beforeExit")).toBe(beforeMountCount);
});
