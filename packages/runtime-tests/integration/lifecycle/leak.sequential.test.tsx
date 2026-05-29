// Sequential: asserts on process-global resource counts (process exit/SIGINT/
// beforeExit listeners, live yoga nodes). Concurrent siblings that mount/unmount
// apps add and remove those listeners/nodes, polluting the counts. Tests are
// it.sequential.

import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, createApp, Text, useInput } from "@vue-tui/runtime";
import { yogaNodeTracker } from "@vue-tui/runtime/internal";
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

test.sequential("100 render/unmount cycles leak zero yoga nodes", async () => {
  yogaNodeTracker.reset();

  const App = defineComponent(() => () => <Text>x</Text>);

  for (let i = 0; i < 100; i++) {
    const { unmount } = await render(App);
    unmount();
  }

  expect(yogaNodeTracker.snapshot().live).toBe(0);
});

test.sequential("raw mode stays on when one of two useInput components unmounts", async () => {
  const showB = shallowRef(true);

  const Listener = defineComponent(() => {
    useInput(() => {});
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

test.sequential("waitUntilRenderFlush after unmount does not register beforeExit listener", async () => {
  const App = defineComponent(() => () => <Text>Hello</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

  const beforeWaitCount = process.listenerCount("beforeExit");
  app.unmount();
  await app.waitUntilRenderFlush();
  expect(process.listenerCount("beforeExit")).toBe(beforeWaitCount);
});
