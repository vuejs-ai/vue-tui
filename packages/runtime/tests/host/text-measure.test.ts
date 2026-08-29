import { defineComponent, h } from "vue";
import { expect, test } from "vite-plus/test";
import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import { createText, createTextLeaf, createVirtualText } from "../../src/host/nodes.ts";
import {
  flattenLeaves,
  measureTextNatural,
  safeSliceEnd,
  sliceAnsiPreservingIntensity,
  wrapText,
} from "../../src/host/text-measure.ts";
import { renderToString } from "../../src/render-to-string.ts";
import Box from "../../src/components/box.vue";
import Text from "../../src/components/text.vue";

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

test("wrapText truncate cuts with ellipsis", () => {
  expect(wrapText("abcdefgh", 5, "truncate")).toEqual(["abcd…"]);
});

test("wrapText at width 0 places non-empty text on its own row", () => {
  // wrapAnsi("A", 0, {hard:true, trim:false}) = "\nA", so zero-width text
  // occupies a second row instead of disappearing.
  expect(wrapText("A", 0, "wrap")).toEqual(["", "A"]);
  expect(wrapText("A", 0, "hard")).toEqual(["", "A"]);
});

test("wrapText at width 0 keeps empty text to one empty row", () => {
  // Empty text measures width 0 (≤ 0), so wrapAnsi("", 0) = "" → [""] (height 1).
  expect(wrapText("", 0, "wrap")).toEqual([""]);
});

test("wrapText at width 0 truncates to empty", () => {
  // cliTruncate("A", 0) = "" for a zero-width cell.
  expect(wrapText("A", 0, "truncate")).toEqual([""]);
});

test("wrapText at width 0 keeps SGR codes intact on a styled string (no byte-split)", () => {
  // wrap-ansi@10 byte-splits the escapes of a styled string at width<=0.
  // wrapText instead emits a leading empty row and one ANSI-preserving row per grapheme.
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
  // re-emits its background span on the glyph's own row.
  expect(wrapText("\x1b[41m你好\x1b[49m", 0, "wrap")).toEqual([
    "",
    "\x1b[41m你\x1b[49m",
    "\x1b[41m好\x1b[49m",
  ]);
  // Mixed narrow + wide.
  expect(wrapText("A你", 0, "wrap")).toEqual(["", "A", "你"]);
});

test("ANSI slicing preserves independent bold and dim intensity at the first retained cell", () => {
  const styled = "\x1b[1m\x1b[2mAA\x1b[22m\x1b[2mBB\x1b[22m";

  expect(sliceAnsiPreservingIntensity(styled, 0, 3)).toBe(
    "\x1b[1m\x1b[2mAA\x1b[22m\x1b[2mB\x1b[22m",
  );
  expect(safeSliceEnd(styled, 3)).toBe("\x1b[1m\x1b[2mAA\x1b[22m\x1b[2mB\x1b[22m");
  expect(wrapText("\x1b[1m\x1b[2mA\x1b[22m\x1b[2mB\x1b[22m", 0, "wrap")).toEqual([
    "",
    "\x1b[1m\x1b[2mA\x1b[22m",
    "\x1b[2mB\x1b[22m",
  ]);
});

test("wrapText at width 0 splits each hard-newline line independently", () => {
  // wrapAnsi("A\nB", 0) = "\nA\n\nB"; each input line gets a leading "" plus its graphemes.
  expect(wrapText("A\nB", 0, "wrap")).toEqual(["", "A", "", "B"]);
});

test("wrapText at width 0 places a zero-width character on its own row", () => {
  // wrap-ansi places the ZWSP (U+200B) on its own row, preserving the Yoga
  // height implied by the produced lines.
  expect(wrapText("A​B", 0, "wrap")).toEqual(["", "A", "​", "", "B"]);
});

test("wrapText at width 0 does NOT drop text after a leading zero-width + wide glyph", () => {
  // A leading zero-width character occupies its own row without terminating the
  // grapheme walk; the following wide glyph remains present.
  expect(wrapText("​中", 0, "wrap")).toEqual(["​", "", "中"]);
});

test("wrapText at width 0 in hard mode adds a blank row at each interior word boundary", () => {
  // `hard` uses `wordWrap:false`, unlike `wrap`. At width 0 this makes wrap-ansi
  // emit an extra blank row before each interior word's first grapheme.
  // wrapAnsi("a b c", 0, {hard:true, trim:false, wordWrap:false}) =
  //   ["","a"," ","","b"," ","","c"]  (height 8)
  // whereas `wrap` mode (no wordWrap:false) =
  //   ["","a"," ","b"," ","c"]        (height 6).
  // Measuring `hard` with `wrap` structure UNDER-counts the height, so a sibling laid out below
  // this node lands one row too high. The mode must reach wrapZeroWidthAnsi.
  expect(wrapText("a b c", 0, "hard")).toEqual(["", "a", " ", "", "b", " ", "", "c"]);
  // `wrap` mode at width 0 stays UNCHANGED (no wordWrap:false → no extra blank rows).
  expect(wrapText("a b c", 0, "wrap")).toEqual(["", "a", " ", "b", " ", "c"]);
});

test("wrapText at width 0 in HARD mode re-styles correctly across the extra blank rows", () => {
  // The re-styling slot map must still pair each NON-EMPTY row with the right grapheme/SGR span
  // even though hard mode inserts extra "" rows. Red-bg over "a b": hard layout is
  // ["","a"," ","","b"] — the "a" and "b" rows keep their SGR span, the blank rows stay empty.
  const styled = "\x1b[41ma b\x1b[49m";
  const plainStructure = wrapAnsi("a b", 0, { hard: true, trim: false, wordWrap: false }).split(
    "\n",
  );
  const got = wrapText(styled, 0, "hard");
  expect(got.length).toBe(plainStructure.length);
  expect(got.map(stripAnsi)).toEqual(plainStructure);
  expect(got).toEqual(["", "\x1b[41ma\x1b[49m", "\x1b[41m \x1b[49m", "", "\x1b[41mb\x1b[49m"]);
});

// Load-bearing lock: in HARD mode wrapZeroWidthAnsi's LINE STRUCTURE must EXACTLY equal
// wrap-ansi's width-0 layout with `wordWrap:false`,
// across the same battery used for `wrap` mode below.
test("wrapText at width 0 in HARD mode matches wrap-ansi's wordWrap:false width-0 layout for the full battery", () => {
  const battery = [
    "a b c", // multiple interior word boundaries → multiple extra blank rows
    "a b",
    "ab cd",
    "A",
    "AB",
    "",
    " ",
    "A\nB",
    "A​B", // ZWSP
    "​中", // ZWSP + wide
    "中​A", // wide + ZWSP
    "áb", // composed acute (NFC form)
    "áb", // EXPLICITLY decomposed
    "⚠️", // VS16
    "🍔", // emoji
    "👨‍👩‍👧", // ZWJ family
    "a­b", // soft hyphen
    "X​Y中​Z\nP­Q", // mixed multiline
    "中​", // trailing zero-width
  ];
  for (const input of battery) {
    const expected = wrapAnsi(input, 0, { hard: true, trim: false, wordWrap: false }).split("\n");
    expect(wrapText(input, 0, "hard"), `input=${JSON.stringify(input)}`).toEqual(expected);
  }
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
  // keeps its SGR span, and the line count matches the plain version.
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

test("truncate shortens each hard-newline segment independently", () => {
  const lines = wrapText("abcdef\nghijkl", 5, "truncate");
  expect(lines).toEqual(["abcd…", "ghij…"]);
});

test.each([
  ["truncate", ["AB👩‍💻C…", "ABCDE…", "ábcde…", "中文a…", "fit"]],
  ["truncate-middle", ["AB…FG", "ABC…Z", "ábc…gh", "中…bc", "fit"]],
  ["truncate-start", ["…CDEFG", "…EF👩‍💻Z", "…defgh", "…文abc", "fit"]],
] as const)(
  "%s truncates every hard line independently without splitting graphemes",
  (mode, expected) => {
    const lines = wrapText("AB👩‍💻CDEFG\nABCDEF👩‍💻Z\nábcdefgh\n中文abc\nfit", 6, mode);

    expect(lines).toEqual(expected);
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(6);
  },
);

test.each(["truncate", "truncate-middle", "truncate-start"] as const)(
  "%s keeps one result per hard line at the zero- and ellipsis-width boundaries",
  (mode) => {
    expect(wrapText("long\nx", 0, mode)).toEqual(["", ""]);
    expect(wrapText("long\nx", 1, mode)).toEqual(["…", "x"]);
  },
);

test("ZWJ emoji truncation does not exceed requested width", () => {
  const result = wrapText("👩‍💻abc", 2, "truncate-start");
  expect(stringWidth(result[0]!)).toBeLessThanOrEqual(2);
});

test("measureTextNatural uses widest line and raw line count", () => {
  expect(measureTextNatural("x\nyhello")).toEqual({ width: 6, height: 2 });
  expect(measureTextNatural("中文\nx")).toEqual({ width: 4, height: 2 });
  expect(measureTextNatural("")).toEqual({ width: 0, height: 1 });
});

// A trailing newline produces an extra empty trailing line, and a
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

test("terminal-viewport empty write does not corrupt existing wide characters", () => {
  // When the terminal viewport clips a write to an empty string, the boundary
  // cleanup must not run, otherwise it would destroy a wide character that
  // isn't actually being overwritten. Private component-overflow behavior is
  // covered through raw host tests rather than an unsupported public Box prop.
  const App = defineComponent(
    () => () =>
      h(Box, { width: 4, height: 1 }, () => [
        h(Text, null, () => "あい"),
        h(Box, { position: "absolute", left: -1, width: 1 }, () => h(Text, null, () => "Z")),
      ]),
  );

  const output = renderToString(App, { width: 4 });
  expect(stripAnsi(output)).toBe("あい");
});
