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
