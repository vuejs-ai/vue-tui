import { expect, test } from "vite-plus/test";
import { applyTextStyle, colorSpan } from "../../src/text/text-style.ts";

// Composition emits every color at full fidelity; reducing it to the host's
// capability is the frame encoder's job, so nothing here selects a level.

test("named color opens the ANSI 16 code it names", () => {
  expect(applyTextStyle("x", { color: "red" })).toBe("\x1b[31mx\x1b[39m");
  expect(applyTextStyle("x", { color: "gray" })).toBe("\x1b[90mx\x1b[39m");
  expect(applyTextStyle("x", { backgroundColor: "whiteBright" })).toBe("\x1b[107mx\x1b[49m");
});

test("hex color opens truecolor, expanding the short form", () => {
  expect(applyTextStyle("x", { color: "#ff0000" })).toBe("\x1b[38;2;255;0;0mx\x1b[39m");
  expect(applyTextStyle("x", { color: "#f00" })).toBe("\x1b[38;2;255;0;0mx\x1b[39m");
  expect(applyTextStyle("x", { backgroundColor: "#FF8800" })).toBe("\x1b[48;2;255;136;0mx\x1b[49m");
});

test("non-string color values do not have a tuple-specific styling path", () => {
  expect(applyTextStyle("x", { color: [255, 0, 0] })).toBe("x");
});

test("unknown color name falls back to no color", () => {
  expect(applyTextStyle("x", { color: "not-a-real-color" })).toBe("x");
});

test("default colors emit explicit terminal-default spans independently", () => {
  expect(applyTextStyle("x", { color: "default" })).toBe("\x1b[39mx\x1b[39m");
  expect(applyTextStyle("x", { backgroundColor: "default" })).toBe("\x1b[49mx\x1b[49m");
});

test("ansi256 colors open the indexed form", () => {
  expect(applyTextStyle("x", { color: "ansi256(194)" })).toBe("\x1b[38;5;194mx\x1b[39m");
  expect(applyTextStyle("x", { backgroundColor: "ansi256(194)" })).toBe("\x1b[48;5;194mx\x1b[49m");
});

test("rgb colors open the truecolor form", () => {
  expect(applyTextStyle("x", { color: "rgb(1, 2, 3)" })).toBe("\x1b[38;2;1;2;3mx\x1b[39m");
  expect(applyTextStyle("x", { backgroundColor: "rgb(1,2,3)" })).toBe("\x1b[48;2;1;2;3mx\x1b[49m");
});

// Functional color parsing accepts ansi256(N) only when N is numeric.
test("unparseable ansi256(foo) emits no codes", () => {
  expect(applyTextStyle("X", { color: "ansi256(foo)" })).toBe("X");
  expect(applyTextStyle("X", { backgroundColor: "ansi256(foo)" })).toBe("X");
});

test("ansi(194) is not a supported form and emits no codes", () => {
  expect(applyTextStyle("X", { color: "ansi(194)" })).toBe("X");
  expect(applyTextStyle("X", { backgroundColor: "ansi(194)" })).toBe("X");
});

test("multiple modifiers chain", () => {
  // Each style is its own span in the documented order.
  // bold then underline => underline(bold(x)).
  expect(applyTextStyle("x", { bold: true, underline: true })).toBe(
    "\x1b[4m\x1b[1mx\x1b[22m\x1b[24m",
  );
});

// The nesting order is dim,color,bg,bold,italic,underline,strikethrough,inverse.
test("color+bold nests bold outside color", () => {
  expect(applyTextStyle("X", { color: "red", bold: true })).toBe(
    "\x1b[1m\x1b[31mX\x1b[39m\x1b[22m",
  );
});

test("dim+bold re-opens bold after dim's SGR-22 reset", () => {
  expect(applyTextStyle("X", { dimColor: true, bold: true })).toBe(
    "\x1b[1m\x1b[2mX\x1b[22m\x1b[1m\x1b[22m",
  );
});

test("color+backgroundColor nests bg outside color", () => {
  expect(applyTextStyle("X", { color: "red", backgroundColor: "blue" })).toBe(
    "\x1b[44m\x1b[31mX\x1b[39m\x1b[49m",
  );
});

test("an authored close inside the run re-opens the enclosing span", () => {
  expect(applyTextStyle("a\x1b[39mb", { color: "red" })).toBe("\x1b[31ma\x1b[39m\x1b[31mb\x1b[39m");
});

test("each physical line carries the span on its own", () => {
  expect(applyTextStyle("a\nb", { bold: true })).toBe("\x1b[1ma\x1b[22m\n\x1b[1mb\x1b[22m");
});

test("an empty run stays empty", () => {
  expect(applyTextStyle("", { bold: true, color: "red" })).toBe("");
});

test("colorSpan reports the span an authored value opens", () => {
  expect(colorSpan("red", false)).toEqual({ open: "\x1b[31m", close: "\x1b[39m" });
  expect(colorSpan("red", true)).toEqual({ open: "\x1b[41m", close: "\x1b[49m" });
  expect(colorSpan("not-a-real-color", false)).toBeUndefined();
  expect(colorSpan(undefined, false)).toBeUndefined();
});
