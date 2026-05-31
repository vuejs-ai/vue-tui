import { defineComponent } from "vue";
import { test, expect } from "vite-plus/test";
import stripAnsi from "strip-ansi";
import stringWidth from "string-width";
import { renderToString, Box, Text } from "@vue-tui/runtime";

test("wide characters do not add extra space inside fixed-width Box", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box>
          <Box width={2}>
            <Text>🍔</Text>
          </Box>
          <Text>|</Text>
        </Box>
        <Box>
          <Box width={2}>
            <Text>⏳</Text>
          </Box>
          <Text>|</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  const lines = output.split("\n");
  expect(lines.length).toBe(2);
  expect(lines[0]).toBe("🍔|");
  expect(lines[1]).toBe("⏳|");
});

test("CJK characters occupy correct width in fixed-width Box", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box>
        <Box width={4}>
          <Text>你好</Text>
        </Box>
        <Text>|</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(output).toBe("你好|");
});

test("mixed ASCII and wide characters align correctly", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box>
          <Box width={6}>
            <Text>ab🍔cd</Text>
          </Box>
          <Text>|</Text>
        </Box>
        <Box>
          <Box width={6}>
            <Text>abcdef</Text>
          </Box>
          <Text>|</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  const lines = output.split("\n");
  expect(lines.length).toBe(2);
  expect(lines[0]).toBe("ab🍔cd|");
  expect(lines[1]).toBe("abcdef|");
});

test("ANSI styled text does not affect layout width", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box>
        <Box width={5}>
          <Text color="red">hello</Text>
        </Box>
        <Text>|</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(stripAnsi(output)).toBe("hello|");
});

test("empty Text does not affect sibling layout", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box>
        <Text />
        <Text>hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(output).toBe("hello");
});

test("truncate CJK text at end", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={20}>
        <Text wrap="truncate">あいうえおかきくけこ|end</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(stringWidth(stripAnsi(output))).toBeLessThanOrEqual(20);
});

test("truncate CJK text in the middle", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={20}>
        <Text wrap="truncate-middle">あいうえおかきくけこ|end</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(stringWidth(stripAnsi(output))).toBeLessThanOrEqual(20);
});

test("truncate CJK text at start", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={20}>
        <Text wrap="truncate-start">あいうえおかきくけこ|end</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(stringWidth(stripAnsi(output))).toBeLessThanOrEqual(20);
});

test("truncate CJK text does not exceed Box width", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box>
        <Box width={20}>
          <Text wrap="truncate">あいうえおかきくけこ|end</Text>
        </Box>
        <Text>|</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const lines = output.split("\n");
  expect(lines.length).toBe(1);
  expect(stripAnsi(lines[0]!).endsWith("|")).toBe(true);
});

test("overlay on 2nd cell of CJK character clears the full character", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={20} height={1}>
        <Text>あいうえおかきくけこ</Text>
        <Box position="absolute" left={9}>
          <Text>XYZ</Text>
        </Box>
      </Box>
    )),
    { columns: 20 },
  );
  const lines = output.split("\n");
  expect(stringWidth(lines[0]!)).toBe(20);
  expect(stripAnsi(lines[0]!)).toBe("あいうえ XYZきくけこ");
});

test("overlay on 1st cell of CJK character clears trailing placeholder", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={20} height={1}>
        <Text>あいうえおかきくけこ</Text>
        <Box position="absolute" left={10}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 20 },
  );
  const lines = output.split("\n");
  expect(stringWidth(lines[0]!)).toBe(20);
  expect(stripAnsi(lines[0]!)).toBe("あいうえおX きくけこ");
});

test("CJK overlay on 2nd cell of CJK clears both sides", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={20} height={1}>
        <Text>あいうえおかきくけこ</Text>
        <Box position="absolute" left={5}>
          <Text>漢字テスト</Text>
        </Box>
      </Box>
    )),
    { columns: 20 },
  );
  const lines = output.split("\n");
  expect(stringWidth(lines[0]!)).toBe(20);
  expect(stripAnsi(lines[0]!)).toBe("あい 漢字テスト けこ");
});

test("clipped empty write does not corrupt existing wide characters", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={4} height={1} overflowX="hidden">
        <Text>あい</Text>
        <Box position="absolute" left={-1} width={1}>
          <Text>Z</Text>
        </Box>
      </Box>
    )),
    { columns: 4 },
  );
  expect(stripAnsi(output)).toBe("あい");
});

// A wide char whose LEADING cell is in-bounds but TRAILING cell exceeds the
// terminal/box width must still render its leading cell and OVERFLOW the row —
// matching Ink, which has no x-bounds check in its Output write loop. The
// past-width trailing placeholder is dropped later by line.filter + trimEnd.
// Box width 4 (== terminal); 你 (width 2) overlaid at left=3 lands on cols 3,4 —
// trailing col 4 is past width. Ink renders "aa 你" (visible width 5); vue used
// to drop 你 wholesale (its leading col-3 cell included) via the now-removed
// `offsetX + characterWidth > this.width` guard. Verified against the built Ink
// reference (/tmp/ink @ v7.0.4 renderToString of this exact tree → "aa 你").
test("wide char with in-bounds leading cell but out-of-bounds trailing cell still renders (overflows row, Ink parity)", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={4} height={1}>
        <Text>aa</Text>
        <Box position="absolute" left={3}>
          <Text>你</Text>
        </Box>
      </Box>
    )),
    { columns: 4 },
  );
  expect(stripAnsi(output)).toBe("aa 你");
  expect(stringWidth(stripAnsi(output))).toBe(5);
});
