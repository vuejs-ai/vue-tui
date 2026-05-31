import { defineComponent, h } from "vue";
import { expect, test } from "vite-plus/test";
import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import { createText, createTextLeaf, createTransform, createVirtualText } from "./nodes.ts";
import { flattenLeaves, measureTextNatural, wrapText } from "./text-measure.ts";
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

// G21 follow-up, finding 1: flattenLeaves must NOT apply a transform to empty
// inner text — matches paint.ts `innerText.length > 0` guard and Ink
// squash-text-nodes.ts:34 (`nodeText.length > 0`). Without the guard,
// a transform that adds chars to an empty string inflates the measured width
// relative to what paint actually renders, causing layout/wrapping mismatch.
test("flattenLeaves skips transform on empty nested text (length guard)", () => {
  // Transform that adds chars to any input (including empty string).
  const addCharsTransform = (s: string, _i: number) => s + "[X]";
  const t = createText();
  const leaf = createTextLeaf("ab");
  leaf.parent = t;
  // Empty transform child: no text leaves inside it.
  const emptyTransform = createTransform(addCharsTransform);
  emptyTransform.parent = t;
  t.children = [leaf, emptyTransform];
  // With the guard: flattenLeaves("ab" + skip-empty-transform) = "ab".
  // Without the guard: flattenLeaves("ab" + "[X]") = "ab[X]" (inflated width).
  expect(flattenLeaves(t)).toBe("ab");
});

test("wrapText splits on width", () => {
  expect(wrapText("hello world", 5, "wrap")).toEqual(["hello", " ", "world"]);
});

test("wrapText truncate-end cuts with ellipsis", () => {
  expect(wrapText("abcdefgh", 5, "truncate-end")).toEqual(["abcd…"]);
});

test("wrapText at width 0 wraps non-empty text onto its own line (Ink parity)", () => {
  // Ink has NO width<=0 guard: wrapAnsi("A", 0, {hard:true, trim:false}) = "\nA",
  // so a 0-width text occupies a SECOND row (height 2). This is what makes Ink
  // render "B\nA" for a 0-width Box beside a sibling, instead of dropping the text.
  expect(wrapText("A", 0, "wrap")).toEqual(["", "A"]);
  expect(wrapText("A", 0, "hard")).toEqual(["", "A"]);
});

test("wrapText at width 0 keeps EMPTY text empty (no spurious blank row)", () => {
  // Empty text measures width 0 (≤ 0), so wrapAnsi("", 0) = "" → [""] (height 1).
  // The 0-width fix must not turn empty text into an extra row.
  expect(wrapText("", 0, "wrap")).toEqual([""]);
});

test("wrapText at width 0 truncates to empty", () => {
  // cliTruncate("A", 0) = "" — matches Ink's truncate path at a 0-width cell.
  expect(wrapText("A", 0, "truncate")).toEqual([""]);
});

test("wrapText at width 0 keeps SGR codes intact on a styled string (no byte-split)", () => {
  // wrap-ansi@10 byte-splits the escapes of a STYLED string at width<=0
  // (wrapAnsi("\x1b[41mA\x1b[49m", 0) = "\x1b\n[\n4\n1\nm\nA\n…"), which corrupted the
  // frame to "B\n[". wrapText now splits ANSI-awarely: leading "" + one entry per grapheme
  // with its SGR span preserved, matching Ink's per-grapheme colored output.
  expect(wrapText("\x1b[41mA\x1b[49m", 0, "wrap")).toEqual(["", "\x1b[41mA\x1b[49m"]);
  expect(wrapText("\x1b[41mAB\x1b[49m", 0, "wrap")).toEqual([
    "",
    "\x1b[41mA\x1b[49m",
    "\x1b[41mB\x1b[49m",
  ]);
  // hard mode behaves identically at width 0 (every grapheme must break anyway).
  expect(wrapText("\x1b[41mAB\x1b[49m", 0, "hard")).toEqual([
    "",
    "\x1b[41mA\x1b[49m",
    "\x1b[41mB\x1b[49m",
  ]);
});

test("wrapText at width 0 keeps a wide (CJK) glyph whole and styled", () => {
  // A 2-column glyph must NOT be column-sliced in half; slice-ansi keeps it whole and
  // re-emits its bg span — matching Ink's "\x1b[41m你\x1b[49m" on its own row.
  expect(wrapText("\x1b[41m你好\x1b[49m", 0, "wrap")).toEqual([
    "",
    "\x1b[41m你\x1b[49m",
    "\x1b[41m好\x1b[49m",
  ]);
  // Mixed narrow + wide.
  expect(wrapText("A你", 0, "wrap")).toEqual(["", "A", "你"]);
});

test("wrapText at width 0 splits each hard-newline line independently", () => {
  // wrapAnsi("A\nB", 0) = "\nA\n\nB"; each input line gets a leading "" plus its graphemes.
  expect(wrapText("A\nB", 0, "wrap")).toEqual(["", "A", "", "B"]);
});

test("wrapText at width 0 places a ZERO-WIDTH char on its OWN row (line-count parity)", () => {
  // Reviewer reproducer 1: the old column-stepping slice glued the ZWSP (U+200B) onto the
  // next grapheme and advanced only 1 column, yielding ["", "A", "​B"] (count 3). wrap-ansi
  // places the ZWSP on its own row: ["", "A", "​", "", "B"] (count 5) — required for height
  // parity with Ink (wrong line count → wrong yoga height).
  expect(wrapText("A​B", 0, "wrap")).toEqual(["", "A", "​", "", "B"]);
});

test("wrapText at width 0 does NOT drop text after a leading zero-width + wide glyph", () => {
  // Reviewer reproducer 2: the old `if (cellWidth === 0) break` abandoned the rest of the
  // line when a zero-width char preceded a wide glyph, so "​中" returned [""] (中 GONE).
  // wrap-ansi keeps everything: ["​", "", "中"].
  expect(wrapText("​中", 0, "wrap")).toEqual(["​", "", "中"]);
});

// Load-bearing lock: wrapZeroWidthAnsi's LINE STRUCTURE must EXACTLY equal wrap-ansi's
// authoritative width-0 layout for plain text across a battery of zero-width / wide / combining
// / emoji / multiline inputs. Imported the same way the source imports wrap-ansi.
test("wrapText at width 0 matches wrap-ansi's plain width-0 layout for the full battery", () => {
  const battery = [
    "A",
    "AB",
    "",
    " ",
    "A\nB",
    "A​B", // ZWSP
    "​中", // ZWSP + wide
    "中​A", // wide + ZWSP
    "\u00e1b", // composed acute (NFC form)
    "a\u0301b", // EXPLICITLY decomposed (a + U+0301): wrap-ansi NFC-composes, so wrapText must too
    "\u0301a", // leading combining mark
    "\u4e2d\u0301", // combining mark on a wide glyph
    "⚠️", // VS16
    "🍔", // emoji
    "👨‍👩‍👧", // ZWJ family
    "a­b", // soft hyphen
    "﻿A", // BOM
    "X​Y中​Z\nP­Q", // mixed multiline
    "中​", // TRAILING zero-width: wrap-ansi glues it to the prev row (["","中​"]), not its own row
    "AB​", // trailing zero-width after a narrow glyph
    "A​​B", // consecutive interior zero-widths (each its own row, no extra leading "")
    "中​中", // wide / interior zero-width / wide
  ];
  for (const input of battery) {
    const expected = wrapAnsi(input, 0, { hard: true, trim: false }).split("\n");
    expect(wrapText(input, 0, "wrap"), `input=${JSON.stringify(input)}`).toEqual(expected);
  }
});

test("wrapText at width 0 preserves SGR styling per non-empty row with a zero-width char", () => {
  // A styled input whose painted span straddles a zero-width char: each non-empty output row
  // keeps its SGR span, and the line count matches the PLAIN version (structure parity).
  const styled = "\x1b[41mA​B\x1b[49m";
  const plainStructure = wrapAnsi("A​B", 0, { hard: true, trim: false }).split("\n");
  const got = wrapText(styled, 0, "wrap");
  // Line count matches the plain structure exactly.
  expect(got.length).toBe(plainStructure.length);
  // Each non-empty row carries its red-bg SGR span; empty rows stay empty.
  expect(got).toEqual(["", "\x1b[41mA\x1b[49m", "\x1b[41m​\x1b[49m", "", "\x1b[41mB\x1b[49m"]);
  // Stripping the SGR from each row reproduces the plain structure.
  expect(got.map(stripAnsi)).toEqual(plainStructure);
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

test("measureTextNatural uses widest line and raw line count", () => {
  expect(measureTextNatural("x\nyhello")).toEqual({ width: 6, height: 2 });
  expect(measureTextNatural("中文\nx")).toEqual({ width: 4, height: 2 });
  expect(measureTextNatural("")).toEqual({ width: 0, height: 1 });
});

// Ink measure-text.tsx:24-34 (widest-line width, `text.split('\n').length`
// height): a TRAILING newline produces an extra (empty) trailing line, and a
// string of only newlines is all empty lines. height = number of \n-separated
// segments; width = widest line.
test("measureTextNatural counts the trailing-newline empty line", () => {
  // "hello\n" → ["hello", ""] → widest line 5, two lines.
  expect(measureTextNatural("hello\n")).toEqual({ width: 5, height: 2 });
});

test("measureTextNatural counts an only-newline string as all empty lines", () => {
  // "\n\n" → ["", "", ""] → no visible width, three lines.
  expect(measureTextNatural("\n\n")).toEqual({ width: 0, height: 3 });
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
