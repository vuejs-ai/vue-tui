import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

const BG_BLUE = "\x1b[44m";

test("Box backgroundColor produces ANSI background codes", async () => {
  const { frames } = await render(
    () => <Box backgroundColor="blue" width={5} height={1} />,
    { columns: 10 },
  );
  expect(frames.at(-1)).toContain(BG_BLUE);
});

test("Box backgroundColor survives border rendering", async () => {
  const { frames } = await render(
    () => <Box backgroundColor="blue" borderStyle="single" width={6} height={3} />,
    { columns: 10 },
  );
  const raw = frames.at(-1)!;
  expect(raw).toContain(BG_BLUE);
  expect(raw).toContain("┌");
});

test("child Text inherits backgroundColor from parent Box", async () => {
  const { frames } = await render(
    () => (
      <Box backgroundColor="blue" width={10} height={1}>
        <Text>hello</Text>
      </Box>
    ),
    { columns: 20 },
  );
  const raw = frames.at(-1)!;
  expect(raw).toContain("hello");
  expect(raw).toContain(BG_BLUE);
});

test("wrapped text preserves backgroundColor on every line", async () => {
  const { frames } = await render(
    () => (
      <Box backgroundColor="blue" borderStyle="single" width={10} height={4}>
        <Text>long text here</Text>
      </Box>
    ),
    { columns: 20 },
  );
  const raw = frames.at(-1)!;
  const lines = raw.split("\n").filter(Boolean);
  for (const line of lines) {
    expect(line).toContain(BG_BLUE);
  }
});
