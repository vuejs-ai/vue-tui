import { expect, test } from "vite-plus/test";
import {
  colorContribution,
  parseColorValue,
  TextStyleChannel,
  textStyleContributions,
} from "../../src/text/text-style.ts";
import { StyleAttribute } from "../../src/frame/style.ts";

// Props resolve every color at full fidelity; reducing it to the host's
// capability is the frame encoder's job, so nothing here selects a level.

test("named color resolves the ANSI 16 index it names", () => {
  expect(parseColorValue("red")).toEqual({ kind: "ansi16", index: 1 });
  expect(parseColorValue("gray")).toEqual({ kind: "ansi16", index: 8 });
  expect(parseColorValue("whiteBright")).toEqual({ kind: "ansi16", index: 15 });
});

test("hex color resolves truecolor, expanding the short form", () => {
  expect(parseColorValue("#ff0000")).toEqual({ kind: "rgb", red: 255, green: 0, blue: 0 });
  expect(parseColorValue("#f00")).toEqual({ kind: "rgb", red: 255, green: 0, blue: 0 });
  expect(parseColorValue("#FF8800")).toEqual({ kind: "rgb", red: 255, green: 136, blue: 0 });
});

test("non-string color values do not have a tuple-specific path", () => {
  expect(parseColorValue([255, 0, 0])).toBeUndefined();
});

test("unknown color name falls back to no color", () => {
  expect(parseColorValue("not-a-real-color")).toBeUndefined();
});

test("default colors select the terminal's own color for their channel", () => {
  expect(colorContribution("default", false)).toEqual({
    kind: "foreground",
    close: "\x1b[39m",
    color: { kind: "default" },
  });
  expect(colorContribution("default", true)).toEqual({
    kind: "background",
    close: "\x1b[49m",
    color: { kind: "default" },
  });
});

test("ansi256 colors resolve the indexed form", () => {
  expect(parseColorValue("ansi256(194)")).toEqual({ kind: "ansi256", index: 194 });
});

test("rgb colors resolve the truecolor form", () => {
  expect(parseColorValue("rgb(1, 2, 3)")).toEqual({ kind: "rgb", red: 1, green: 2, blue: 3 });
  expect(parseColorValue("rgb(1,2,3)")).toEqual({ kind: "rgb", red: 1, green: 2, blue: 3 });
});

// Functional color parsing accepts ansi256(N) only when N is numeric.
test("unparseable ansi256(foo) resolves nothing", () => {
  expect(parseColorValue("ansi256(foo)")).toBeUndefined();
  expect(colorContribution("ansi256(foo)", true)).toBeUndefined();
});

test("ansi(194) is not a supported form", () => {
  expect(parseColorValue("ansi(194)")).toBeUndefined();
  expect(colorContribution("ansi(194)", false)).toBeUndefined();
});

test("multiple modifiers each contribute their own attribute, outermost first", () => {
  expect(textStyleContributions({ bold: true, underline: true }, 0)).toEqual([
    { kind: "attribute", close: "\x1b[24m", attribute: StyleAttribute.underline },
    { kind: "attribute", close: "\x1b[22m", attribute: StyleAttribute.bold },
  ]);
});

// The nesting order is dim,color,bg,bold,italic,underline,strikethrough,inverse,
// so the outermost contribution comes first.
test("color and bold contribute in nesting order, bold outside color", () => {
  expect(textStyleContributions({ color: "red", bold: true }, 0)).toEqual([
    { kind: "attribute", close: "\x1b[22m", attribute: StyleAttribute.bold },
    { kind: "foreground", close: "\x1b[39m", color: { kind: "ansi16", index: 1 } },
  ]);
});

test("dim and bold are independent intensity attributes", () => {
  expect(textStyleContributions({ dimColor: true, bold: true }, 0)).toEqual([
    { kind: "attribute", close: "\x1b[22m", attribute: StyleAttribute.bold },
    { kind: "attribute", close: "\x1b[22m", attribute: StyleAttribute.dim },
  ]);
});

test("color and backgroundColor contribute with background outside color", () => {
  expect(textStyleContributions({ color: "red", backgroundColor: "blue" }, 0)).toEqual([
    { kind: "background", close: "\x1b[49m", color: { kind: "ansi16", index: 4 } },
    { kind: "foreground", close: "\x1b[39m", color: { kind: "ansi16", index: 1 } },
  ]);
});

test("a blocked channel contributes nothing, whatever the props set it to", () => {
  expect(
    textStyleContributions(
      { color: "red", bold: true },
      TextStyleChannel.foreground | TextStyleChannel.bold,
    ),
  ).toEqual([]);
});
