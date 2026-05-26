import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

test("onRender callback is called with renderTime on each commit", async () => {
  const renderTimes: number[] = [];

  const App = defineComponent(() => () => <Text>hello</Text>);

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  app.mount({
    stdout,
    stdin,
    stderr,
    debug: true,
    exitOnCtrlC: false,
    onRender: (info) => {
      renderTimes.push(info.renderTime);
    },
  });

  await nextTick();
  await nextTick();

  expect(renderTimes.length).toBeGreaterThanOrEqual(1);
  expect(renderTimes[0]).toBeTypeOf("number");
  expect(renderTimes[0]).toBeGreaterThanOrEqual(0);

  app.unmount();
});

test("onRender is called on subsequent state updates", async () => {
  const renderTimes: number[] = [];
  const msg = shallowRef("a");

  const App = defineComponent(() => {
    return () => <Text>{msg.value}</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  app.mount({
    stdout,
    stdin,
    stderr,
    debug: true,
    exitOnCtrlC: false,
    onRender: (info) => {
      renderTimes.push(info.renderTime);
    },
  });

  await nextTick();
  await nextTick();
  const initialCount = renderTimes.length;

  msg.value = "b";
  await nextTick();
  await nextTick();

  expect(renderTimes.length).toBeGreaterThan(initialCount);
  app.unmount();
});

test("no onRender callback when option is not provided", async () => {
  // Just verify the app works fine without onRender
  const App = defineComponent(() => () => <Text>no callback</Text>);

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  app.mount({
    stdout,
    stdin,
    stderr,
    debug: true,
    exitOnCtrlC: false,
  });

  await nextTick();
  await nextTick();

  app.unmount();
});
