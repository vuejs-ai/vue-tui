import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("text wraps within border content area, not outer width", async () => {
  // Box is 12 wide with single border (1 char each side).
  // Content area is 12 - 2 = 10 chars.
  // "Hello World!" is 12 chars, should wrap at 10.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="single" width={12}>
        <Text>Hello World!</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const frame = lastFrame()!;
  // Text should wrap to fit the 10-char content area
  expect(frame).toContain("Hello");
  expect(frame).toContain("World!");
  // The text "Hello World!" wraps: "Hello " on line 1, "World!" on line 2
  const lines = frame.split("\n");
  // Should have 4 lines: top border, text line 1, text line 2, bottom border
  expect(lines).toHaveLength(4);
  // Verify text doesn't overflow outside the border
  for (const line of lines) {
    expect(line.length).toBeLessThanOrEqual(12);
  }
});

test("text wraps within padding content area", async () => {
  // Box is 12 wide with padding 1 each side.
  // Content area is 12 - 2 = 10 chars.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={12} paddingX={1}>
        <Text>Hello World!</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const frame = lastFrame()!;
  // Text wraps to 10-char content area
  expect(frame).toContain("Hello");
  expect(frame).toContain("World!");
  // Two lines of text
  const lines = frame.split("\n");
  expect(lines).toHaveLength(2);
});

test("text wraps within border+padding content area", async () => {
  // Box is 14 wide with single border (1 each side) + padding 1 each side.
  // Content area is 14 - 2 (border) - 2 (padding) = 10 chars.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="single" width={14} paddingX={1}>
        <Text>Hello World!</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const frame = lastFrame()!;
  expect(frame).toContain("Hello");
  expect(frame).toContain("World!");
});
