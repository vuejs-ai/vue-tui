import { defineComponent, nextTick, ref } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("Box renders with border", async () => {
  const { lastFrame } = await render(
    () => (
      <Box borderStyle="single" width={10}>
        <Text>hi</Text>
      </Box>
    ),
    { columns: 20 },
  );
  const frame = lastFrame()!;
  expect(frame).toContain("┌");
  expect(frame).toContain("hi");
  expect(frame).toContain("└");
});

test("borderTop:false suppresses top edge", async () => {
  const { lastFrame } = await render(
    () => <Box borderStyle="single" borderTop={false} width={6} height={3} />,
    { columns: 10 },
  );
  const lines = lastFrame()!.split("\n");
  expect(lines[0]).not.toContain("┌");
  expect(lines[0]).not.toContain("─");
  expect(lastFrame()).toContain("└");
});

test("borderBottom:false suppresses bottom edge", async () => {
  const { lastFrame } = await render(
    () => <Box borderStyle="single" borderBottom={false} width={6} height={3} />,
    { columns: 10 },
  );
  const frame = lastFrame()!;
  expect(frame).toContain("┌");
  const lines = frame.split("\n");
  expect(lines.at(-1)).not.toContain("└");
});

test("reactive borderTop:false update removes top edge", async () => {
  const showTop = ref(true);
  const App = defineComponent(() => {
    return () => <Box borderStyle="single" borderTop={showTop.value} width={6} height={3} />;
  });

  const { lastFrame } = await render(App, { columns: 10 });
  expect(lastFrame()).toContain("┌");

  showTop.value = false;
  await nextTick();
  const lines = lastFrame()!.split("\n");
  expect(lines[0]).not.toContain("┌");
  expect(lastFrame()).toContain("└");
});
