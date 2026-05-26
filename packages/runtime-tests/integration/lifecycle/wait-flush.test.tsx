import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text } from "@vue-tui/runtime";

test("waitUntilRenderFlush resolves after frame is written", async () => {
  const App = defineComponent(() => () => <Text>hello</Text>);
  const result = await render(App);
  await result.waitUntilRenderFlush();
  expect(result.lastFrame()).toContain("hello");
});

test("waitUntilRenderFlush waits for pending state updates", async () => {
  const msg = shallowRef("before");
  const App = defineComponent(() => {
    return () => <Text>{msg.value}</Text>;
  });

  const result = await render(App);
  expect(result.lastFrame()).toContain("before");

  msg.value = "after";
  await nextTick();
  await nextTick();
  await result.waitUntilRenderFlush();
  expect(result.lastFrame()).toContain("after");
});

test("waitUntilRenderFlush can be called multiple times", async () => {
  const App = defineComponent(() => () => <Text>stable</Text>);
  const result = await render(App);

  await result.waitUntilRenderFlush();
  await result.waitUntilRenderFlush();
  expect(result.lastFrame()).toContain("stable");
});
