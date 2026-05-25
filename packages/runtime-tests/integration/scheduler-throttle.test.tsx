import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text } from "@vue-tui/runtime";

test("rapid mutations in debug mode produce immediate frames (no throttle)", async () => {
  const count = shallowRef(0);
  const App = defineComponent(() => {
    return () => <Text>{String(count.value)}</Text>;
  });

  const { frames } = await render(App);
  const before = frames.length;

  // Each mutation + tick should produce a frame in debug mode
  for (let i = 1; i <= 5; i++) {
    count.value = i;
    await nextTick();
    await nextTick();
  }

  // In debug mode (used by testing), each mutation produces a frame
  expect(frames.length - before).toBe(5);
});
