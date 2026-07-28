import { defineComponent, nextTick, shallowRef, watch } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("multiple mutations in one tick produce at most 1 new frame", async () => {
  const count = shallowRef(0);
  const App = defineComponent(() => {
    return () => <Text>{String(count.value)}</Text>;
  });

  const { frames, lastFrame } = await render(App);
  const before = frames.length;

  count.value = 1;
  count.value = 2;
  count.value = 3;
  await nextTick();
  await nextTick();

  expect(frames.length - before).toBeLessThanOrEqual(1);
  expect(lastFrame()).toContain("3");
});

test("post-flush watch sees the same value the commit paints", async () => {
  const count = shallowRef(0);
  let observed = 0;

  const App = defineComponent(() => {
    watch(
      count,
      (v) => {
        observed = v;
      },
      { flush: "post" },
    );
    return () => <Text>{String(count.value)}</Text>;
  });

  const { lastFrame } = await render(App);

  count.value = 42;
  await nextTick();
  await nextTick();

  expect(observed).toBe(42);
  expect(lastFrame()).toContain("42");
});

test("resize event schedules a re-render", async () => {
  const App = defineComponent(() => {
    return () => (
      <Box width="100%" borderStyle="single">
        <Text>x</Text>
      </Box>
    );
  });

  const { frames, terminal } = await render(App, { columns: 80 });
  const before = frames.length;

  await terminal.resize(120, 40);
  await nextTick();

  expect(frames.length).toBeGreaterThan(before);
});
