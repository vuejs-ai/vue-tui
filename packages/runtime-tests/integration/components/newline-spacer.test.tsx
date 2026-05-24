import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, Newline, Spacer } from "@vue-tui/runtime";

test("Newline emits line breaks inside Text", async () => {
  const { lastFrame } = await render(() => (
    <Text>
      a<Newline count={2} />b
    </Text>
  ));
  const lines = lastFrame()!.split("\n").filter(Boolean);
  expect(lines.length).toBeGreaterThanOrEqual(2);
});

test("Spacer pushes siblings apart in row direction", async () => {
  const { lastFrame } = await render(
    () => (
      <Box flexDirection="row" width={10}>
        <Text>L</Text>
        <Spacer />
        <Text>R</Text>
      </Box>
    ),
    { columns: 10 },
  );
  const line = lastFrame()!.split("\n")[0]!;
  expect(line.startsWith("L")).toBe(true);
  expect(line.trimEnd().endsWith("R")).toBe(true);
});
