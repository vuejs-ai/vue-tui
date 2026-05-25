import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("v-if toggle preserves sibling order", async () => {
  const show = shallowRef(true);
  const App = defineComponent(() => {
    return () => (
      <Box flexDirection="column">
        <Text>A</Text>
        {show.value ? <Text>B</Text> : null}
        <Text>C</Text>
      </Box>
    );
  });

  const { lastFrame } = await render(App, { columns: 10 });
  expect(lastFrame()).toContain("A");
  expect(lastFrame()).toContain("B");
  expect(lastFrame()).toContain("C");

  show.value = false;
  await nextTick();
  expect(lastFrame()).not.toContain("B");
  expect(lastFrame()).toContain("A");
  expect(lastFrame()).toContain("C");

  show.value = true;
  await nextTick();
  const lines = lastFrame()!.split("\n").filter(Boolean);
  const aIdx = lines.findIndex((l) => l.includes("A"));
  const bIdx = lines.findIndex((l) => l.includes("B"));
  const cIdx = lines.findIndex((l) => l.includes("C"));
  expect(aIdx).toBeLessThan(bIdx);
  expect(bIdx).toBeLessThan(cIdx);
});

test("keyed v-for reorder renders in new order", async () => {
  const items = shallowRef([1, 2, 3]);
  const App = defineComponent(() => {
    return () => (
      <Box flexDirection="column">
        {items.value.map((n) => (
          <Text key={n}>item-{n}</Text>
        ))}
      </Box>
    );
  });

  const { lastFrame } = await render(App, { columns: 20 });
  let lines = lastFrame()!.split("\n").filter(Boolean);
  expect(lines[0]).toContain("item-1");
  expect(lines[1]).toContain("item-2");
  expect(lines[2]).toContain("item-3");

  items.value = [3, 1, 2];
  await nextTick();
  lines = lastFrame()!.split("\n").filter(Boolean);
  expect(lines[0]).toContain("item-3");
  expect(lines[1]).toContain("item-1");
  expect(lines[2]).toContain("item-2");
});

test("repeated list shuffles don't crash", async () => {
  const items = shallowRef([1, 2, 3, 4, 5]);
  const App = defineComponent(() => {
    return () => (
      <Box flexDirection="column">
        {items.value.map((n) => (
          <Text key={n}>{String(n)}</Text>
        ))}
      </Box>
    );
  });

  const { lastFrame } = await render(App, { columns: 10 });

  items.value = [5, 4, 3, 2, 1];
  await nextTick();
  items.value = [2, 4, 1, 5, 3];
  await nextTick();
  items.value = [1, 2, 3, 4, 5];
  await nextTick();

  expect(lastFrame()).toContain("1");
  expect(lastFrame()).toContain("5");
});
