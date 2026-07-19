import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import stripAnsi from "strip-ansi";
import stringWidth from "string-width";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

function box(text: string): string {
  const lines = text.split("\n");
  const width = Math.max(...lines.map((line) => line.length));
  const top = `╭${"─".repeat(width)}╮`;
  const bottom = `╰${"─".repeat(width)}╯`;
  const middle = lines.map((line) => `│${line.padEnd(width)}│`).join("\n");
  return `${top}\n${middle}\n${bottom}`;
}

test("overflowY clips multiline text", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={1} overflowY="hidden">
        <Text>Hello{"\n"}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Hello");
});

test("overflowY clips multiline text inside a border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={20} height={3} overflowY="hidden" borderStyle="round">
        <Text>Hello{"\n"}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(box("Hello".padEnd(18, " ")));
});

test("overflowY clips excess child boxes", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={2} overflowY="hidden" flexDirection="column">
        <Box flexShrink={0}>
          <Text>Line #1</Text>
        </Box>
        <Box flexShrink={0}>
          <Text>Line #2</Text>
        </Box>
        <Box flexShrink={0}>
          <Text>Line #3</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Line #1\nLine #2");
});

test("overflowY clips excess child boxes inside a border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={9} height={4} overflowY="hidden" flexDirection="column" borderStyle="round">
        <Box flexShrink={0}>
          <Text>Line #1</Text>
        </Box>
        <Box flexShrink={0}>
          <Text>Line #2</Text>
        </Box>
        <Box flexShrink={0}>
          <Text>Line #3</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(box("Line #1\nLine #2"));
});

test("overflowY clips a child above the top edge", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={1} overflowY="hidden">
        <Box marginTop={-1} height={2} flexShrink={0}>
          <Text>Hello{"\n"}World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("World");
});

test("overflowY clips a child below the bottom edge", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={1} overflowY="hidden">
        <Box height={2} flexShrink={0}>
          <Text>Hello{"\n"}World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Hello");
});

test("a nested overflowY box cannot reopen its ancestor's clip", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={1} overflowY="hidden" flexDirection="column">
        <Box height={2} overflowY="hidden" flexDirection="column" flexShrink={0}>
          <Text>A{"\n"}B</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("A");
});

test("out of bounds writes are hard-clipped to the Inline terminal width", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Box width={12} height={10} borderStyle="round" />),
    { columns: 10 },
  );

  const expected = [`╭${"─".repeat(9)}`, ...Array<string>(8).fill("│"), `╰${"─".repeat(9)}`].join(
    "\n",
  );
  expect(lastFrame()).toBe(expected);
});

test("a wide grapheme cannot straddle the terminal right edge", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={4} height={1}>
        <Text>abc</Text>
        <Box position="absolute" left={3}>
          <Text>中</Text>
        </Box>
      </Box>
    )),
    { columns: 4 },
  );

  const frame = lastFrame({ trimLines: true })!;
  expect(stripAnsi(frame)).toBe("abc");
  expect(stringWidth(frame)).toBeLessThanOrEqual(4);
});

test("a ZWJ grapheme is dropped whole when it crosses the terminal right edge", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={4} height={1}>
        <Text>ab</Text>
        <Box position="absolute" left={3}>
          <Text>👨‍👩‍👧‍👦</Text>
        </Box>
      </Box>
    )),
    { columns: 4 },
  );

  const frame = stripAnsi(lastFrame({ trimLines: true })!);
  expect(frame).not.toContain("👨");
  expect(stringWidth(frame)).toBeLessThanOrEqual(4);
});

test("text after a wide grapheme clipped at the terminal left edge keeps its column", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={4} height={1}>
        <Box position="absolute" left={-1} flexShrink={0}>
          <Text>中x</Text>
        </Box>
      </Box>
    )),
    { columns: 4 },
  );

  expect(stripAnsi(lastFrame({ trimLines: true })!)).toBe(" x");
});
