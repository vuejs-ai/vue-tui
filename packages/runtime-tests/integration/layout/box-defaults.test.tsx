import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("Box defaults to flexDirection='row'", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AB");
});

test("Box defaults to flexShrink=1", async () => {
  // Two boxes inside a constrained parent: if flexShrink defaults to 1,
  // they should shrink to fit rather than overflowing.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={10}>
        <Box width={8}>
          <Text>AAAAAAAA</Text>
        </Box>
        <Box width={8}>
          <Text>BBBBBBBB</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  // Both boxes should shrink to fit within 10 columns
  const frame = lastFrame({ trimLines: true })!;
  // The frame should be at most 10 chars wide
  const maxLineWidth = Math.max(...frame.split("\n").map((l) => l.length));
  expect(maxLineWidth).toBeLessThanOrEqual(10);
});

test("Box defaults to flexWrap='nowrap'", async () => {
  // With nowrap, items stay on one line even if they overflow
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={10}>
        <Text>Hello</Text>
        <Text>World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Items should be on the same line (row direction, nowrap)
  const frame = lastFrame({ trimLines: true })!;
  expect(frame.split("\n")).toHaveLength(1);
  expect(frame).toBe("HelloWorld");
});

test("Box defaults to flexGrow=0", async () => {
  // A box with no explicit flexGrow should not grow to fill available space
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={20}>
        <Box>
          <Text>A</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  // The inner box should only be as wide as its content (1 char), not 20
  const frame = lastFrame({ trimLines: true })!;
  expect(frame).toBe("A");
});

test("user-provided props override Box defaults", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A\nB");
});
