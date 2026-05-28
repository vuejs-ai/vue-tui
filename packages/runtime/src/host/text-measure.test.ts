import { defineComponent, h } from "vue";
import { expect, test } from "vite-plus/test";
import stringWidth from "string-width";
import { createText, createTextLeaf, createVirtualText } from "./nodes.ts";
import { flattenLeaves, wrapText } from "./text-measure.ts";
import { renderToString } from "../render-to-string.ts";
import { Box } from "../components/Box.ts";
import { Text } from "../components/Text.ts";

// Minimal ANSI-stripping helper for test assertions (avoids strip-ansi dep).
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
}

test("flattenLeaves concatenates a flat text node", () => {
  const t = createText();
  const a = createTextLeaf("hello ");
  const b = createTextLeaf("world");
  a.parent = t;
  b.parent = t;
  t.children = [a, b];
  expect(flattenLeaves(t)).toBe("hello world");
});

test("flattenLeaves recurses into virtual-text", () => {
  const t = createText();
  const v = createVirtualText();
  const a = createTextLeaf("a");
  const b = createTextLeaf("b");
  v.children = [b];
  b.parent = v;
  v.parent = t;
  t.children = [a, v];
  a.parent = t;
  expect(flattenLeaves(t)).toBe("ab");
});

test("wrapText splits on width", () => {
  expect(wrapText("hello world", 5, "wrap")).toEqual(["hello", " ", "world"]);
});

test("wrapText truncate-end cuts with ellipsis", () => {
  expect(wrapText("abcdefgh", 5, "truncate-end")).toEqual(["abcd…"]);
});

test("truncate keeps ZWJ emoji whole", () => {
  const [line] = wrapText("👨‍👩‍👧‍👦abcdefgh", 5, "truncate");
  expect(line).toContain("👨‍👩‍👧‍👦");
  expect(stringWidth(line!)).toBeLessThanOrEqual(5);
});

test("truncate keeps combining marks attached", () => {
  const [line] = wrapText("áb́ćdefghij", 5, "truncate");
  expect(stringWidth(line!)).toBeLessThanOrEqual(5);
  expect(line).not.toMatch(/́$/);
});

test("truncate preserves newlines (no collapse to one line)", () => {
  const lines = wrapText("x\nyhello", 24, "truncate");
  expect(lines.length).toBe(2);
  expect(lines[0]).toBe("x");
  expect(lines[1]).toBe("yhello");
});

test("truncate of multi-line text that overflows collapses to one truncated line (matches Ink)", () => {
  // Ink's wrapText does cliTruncate(text, maxWidth, {position}) on the whole
  // string; when truncation happens, trailing lines are dropped. We match that
  // exactly — do NOT change this to per-line truncation (it would diverge from Ink).
  const lines = wrapText("abcdef\nghijkl", 5, "truncate");
  expect(lines).toEqual(["abcd…"]);
});

// --- Text-width parity tests ported from Ink ---

test("wide characters do not add extra space inside fixed-width Box", () => {
  const App = defineComponent(
    () => () =>
      h(Box, { flexDirection: "column" }, () => [
        h(Box, null, () => [
          h(Box, { width: 2 }, () => h(Text, null, () => "\u{1F354}")),
          h(Text, null, () => "|"),
        ]),
        h(Box, null, () => [
          h(Box, { width: 2 }, () => h(Text, null, () => "⏳")),
          h(Text, null, () => "|"),
        ]),
      ]),
  );

  const output = renderToString(App, { columns: 40 });
  const lines = output.split("\n");
  expect(lines.length).toBe(2);
  expect(lines[0]).toBe("\u{1F354}|");
  expect(lines[1]).toBe("⏳|");
});

test("CJK characters occupy correct width in fixed-width Box", () => {
  const App = defineComponent(
    () => () =>
      h(Box, null, () => [
        h(Box, { width: 4 }, () => h(Text, null, () => "你好")),
        h(Text, null, () => "|"),
      ]),
  );

  const output = renderToString(App, { columns: 40 });
  expect(output).toBe("你好|");
});

test("mixed ASCII and wide characters align correctly", () => {
  const App = defineComponent(
    () => () =>
      h(Box, { flexDirection: "column" }, () => [
        h(Box, null, () => [
          h(Box, { width: 6 }, () => h(Text, null, () => "ab\u{1F354}cd")),
          h(Text, null, () => "|"),
        ]),
        h(Box, null, () => [
          h(Box, { width: 6 }, () => h(Text, null, () => "abcdef")),
          h(Text, null, () => "|"),
        ]),
      ]),
  );

  const output = renderToString(App, { columns: 40 });
  const lines = output.split("\n");
  expect(lines.length).toBe(2);
  expect(lines[0]).toBe("ab\u{1F354}cd|");
  expect(lines[1]).toBe("abcdef|");
});

test("ANSI styled text does not affect layout width", () => {
  const App = defineComponent(
    () => () =>
      h(Box, null, () => [
        h(Box, { width: 5 }, () => h(Text, { color: "red" }, () => "hello")),
        h(Text, null, () => "|"),
      ]),
  );

  const output = renderToString(App, { columns: 40 });
  const stripped = stripAnsi(output);
  expect(stripped).toBe("hello|");
});

test("empty Text does not affect sibling layout", () => {
  const App = defineComponent(
    () => () => h(Box, null, () => [h(Text), h(Text, null, () => "hello")]),
  );

  const output = renderToString(App, { columns: 40 });
  expect(output).toBe("hello");
});

test("truncate CJK text at end", () => {
  const App = defineComponent(
    () => () =>
      h(Box, { width: 20 }, () => h(Text, { wrap: "truncate" }, () => "あいうえおかきくけこ|end")),
  );

  const output = renderToString(App, { columns: 40 });
  const stripped = stripAnsi(output);
  expect(stringWidth(stripped)).toBeLessThanOrEqual(20);
});

test("truncate CJK text in the middle", () => {
  const App = defineComponent(
    () => () =>
      h(Box, { width: 20 }, () =>
        h(Text, { wrap: "truncate-middle" }, () => "あいうえおかきくけこ|end"),
      ),
  );

  const output = renderToString(App, { columns: 40 });
  const stripped = stripAnsi(output);
  expect(stringWidth(stripped)).toBeLessThanOrEqual(20);
});

test("truncate CJK text at start", () => {
  const App = defineComponent(
    () => () =>
      h(Box, { width: 20 }, () =>
        h(Text, { wrap: "truncate-start" }, () => "あいうえおかきくけこ|end"),
      ),
  );

  const output = renderToString(App, { columns: 40 });
  const stripped = stripAnsi(output);
  expect(stringWidth(stripped)).toBeLessThanOrEqual(20);
});

test("truncate CJK text does not exceed Box width", () => {
  const App = defineComponent(
    () => () =>
      h(Box, null, () => [
        h(Box, { width: 20 }, () =>
          h(Text, { wrap: "truncate" }, () => "あいうえおかきくけこ|end"),
        ),
        h(Text, null, () => "|"),
      ]),
  );

  const output = renderToString(App, { columns: 40 });
  const lines = output.split("\n");
  expect(lines.length).toBe(1);

  const stripped = stripAnsi(lines[0]!);
  expect(stripped.endsWith("|")).toBe(true);
});

test("overlay on 2nd cell of CJK character clears the full character", () => {
  // Absolute overlay at left=9 lands on the 2nd cell of お (columns 8-9).
  // お should be replaced by a space so the terminal doesn't render
  // a half-visible wide character.
  const App = defineComponent(
    () => () =>
      h(Box, { width: 20, height: 1 }, () => [
        h(Text, null, () => "あいうえおかきくけこ"),
        h(Box, { position: "absolute", left: 9 }, () => h(Text, null, () => "XYZ")),
      ]),
  );

  const output = renderToString(App, { columns: 20 });
  const lines = output.split("\n");
  expect(stringWidth(lines[0]!)).toBe(20);
  expect(stripAnsi(lines[0]!)).toBe("あいうえ XYZきくけこ");
});

test("overlay on 1st cell of CJK character clears trailing placeholder", () => {
  // Absolute overlay at left=10 lands on the 1st cell of か (columns 10-11).
  // か's trailing placeholder at column 11 should be cleared to a space.
  const App = defineComponent(
    () => () =>
      h(Box, { width: 20, height: 1 }, () => [
        h(Text, null, () => "あいうえおかきくけこ"),
        h(Box, { position: "absolute", left: 10 }, () => h(Text, null, () => "X")),
      ]),
  );

  const output = renderToString(App, { columns: 20 });
  const lines = output.split("\n");
  expect(stringWidth(lines[0]!)).toBe(20);
  expect(stripAnsi(lines[0]!)).toBe("あいうえおX きくけこ");
});

test("CJK overlay on 2nd cell of CJK clears both sides", () => {
  // Absolute overlay at left=5 (2nd cell of う at columns 4-5).
  // 漢字テスト (10 cols) also ends at column 14, overwriting the 1st cell
  // of く (14-15), so く's trailing placeholder must be cleaned too.
  const App = defineComponent(
    () => () =>
      h(Box, { width: 20, height: 1 }, () => [
        h(Text, null, () => "あいうえおかきくけこ"),
        h(Box, { position: "absolute", left: 5 }, () => h(Text, null, () => "漢字テスト")),
      ]),
  );

  const output = renderToString(App, { columns: 20 });
  const lines = output.split("\n");
  expect(stringWidth(lines[0]!)).toBe(20);
  expect(stripAnsi(lines[0]!)).toBe("あい 漢字テスト けこ");
});

test("ZWJ emoji truncation does not exceed requested width", () => {
  const result = wrapText("👩‍💻abc", 2, "truncate-start");
  expect(stringWidth(result[0]!)).toBeLessThanOrEqual(2);
});

test("clipped empty write does not corrupt existing wide characters", () => {
  // When a write is clipped to an empty string, the boundary cleanup
  // must not run, otherwise it would destroy a wide character that
  // isn't actually being overwritten.
  const App = defineComponent(
    () => () =>
      h(Box, { width: 4, height: 1, overflowX: "hidden" }, () => [
        h(Text, null, () => "あい"),
        h(Box, { position: "absolute", left: -1, width: 1 }, () => h(Text, null, () => "Z")),
      ]),
  );

  const output = renderToString(App, { columns: 4 });
  expect(stripAnsi(output)).toBe("あい");
});
