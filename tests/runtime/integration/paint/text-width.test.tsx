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
    { width: 100 },
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
    { width: 100 },
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
    { width: 100 },
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
    { width: 100 },
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
    { width: 100 },
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
    { width: 100 },
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
    { width: 100 },
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
    { width: 20 },
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
    { width: 20 },
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
    { width: 20 },
  );
  const lines = output.split("\n");
  expect(stringWidth(lines[0]!)).toBe(20);
  expect(stripAnsi(lines[0]!)).toBe("あい 漢字テスト けこ");
});

// A wide char whose leading cell is in bounds but trailing cell exceeds the
// terminal/box width still renders the glyph and overflows the row. The
// out-of-bounds trailing placeholder is dropped later by line.filter + trimEnd.
// Box width 4 (== terminal); 你 (width 2) overlaid at left=3 lands on cols 3,4,
// so its trailing cell exceeds the width. A whole-glyph bounds guard would drop
// 你, including its valid
// leading cell at column 3.
test("wide char with an in-bounds leading cell still renders when its trailing cell overflows", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={4} height={1}>
        <Text>aa</Text>
        <Box position="absolute" left={3}>
          <Text>你</Text>
        </Box>
      </Box>
    )),
    { width: 4 },
  );
  expect(stripAnsi(output)).toBe("aa 你");
  expect(stringWidth(stripAnsi(output))).toBe(5);
});
