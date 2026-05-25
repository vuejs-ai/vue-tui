import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("nested top-level Text nodes flow horizontally (row direction)", async () => {
  // In Ink, <Text> renders with flexDirection='row' so that sibling
  // top-level <Text> elements within a row-direction <Box> display inline.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Box defaults to row, so A and B should be on the same line
  expect(lastFrame({ trimLines: true })).toBe("AB");
});

test("top-level Text renders with flexDirection='row' for nested Text", async () => {
  // Two <Text> children inside a column <Box>: each is its own yoga node.
  // Within a single <Text>, nested <Text> renders as virtual-text (no yoga).
  // This test confirms that top-level Text nodes participate in the parent's
  // flex layout with row direction by default.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>
          <Text>A</Text>
          <Text>B</Text>
        </Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Nested Text within a single Text renders inline (virtual-text), so "AB"
  expect(lastFrame({ trimLines: true })).toBe("AB");
});
