import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, Newline } from "@vue-tui/runtime";

test("Newline works standalone (outside Text) as a yoga carrier", async () => {
  // In Ink, Newline renders as ink-text (yoga carrier) so it works
  // outside a Text context as a standalone line break.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Newline />
        <Text>hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Newline should occupy a line before "hi"
  const frame = lastFrame({ trimLines: true })!;
  const lines = frame.split("\n");
  expect(lines.length).toBeGreaterThanOrEqual(2);
  expect(lines.at(-1)).toBe("hi");
});

test("Newline count=2 adds two blank lines standalone", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>above</Text>
        <Newline count={2} />
        <Text>below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const frame = lastFrame({ trimLines: true })!;
  expect(frame).toContain("above");
  expect(frame).toContain("below");
  const lines = frame.split("\n");
  // "above", 2 blank lines, "below" = at least 4 lines
  expect(lines.length).toBeGreaterThanOrEqual(4);
});
