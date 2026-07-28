import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text } from "@vue-tui/runtime";

test("the deterministic host commits each separately flushed mutation", async () => {
  const count = shallowRef(0);
  const App = defineComponent(() => {
    return () => <Text>{String(count.value)}</Text>;
  });

  const { frames } = await render(App);
  const before = frames.length;

  // maxFps:0 in the deterministic host commits each separately flushed update.
  for (let i = 1; i <= 5; i++) {
    count.value = i;
    await nextTick();
    await nextTick();
  }

  expect(frames.length - before).toBe(5);
});
