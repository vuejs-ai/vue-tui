import { expect, test } from "vite-plus/test";
import {
  applyChalk as applyTerminalStyle,
  assertValidBackgroundColor,
  assertValidForegroundColor,
  isInvalidBackgroundColor,
  isInvalidForegroundColor,
} from "../../src/text/text-style.ts";
import { createTerminalStyle } from "../../src/text/terminal-style.ts";

const terminalStyle = createTerminalStyle(1);
const plainStyle = createTerminalStyle(0);
const chalk = terminalStyle.chalk;
const applyChalk = (text: string, props: Parameters<typeof applyTerminalStyle>[2]): string =>
  applyTerminalStyle(terminalStyle, text, props);

test("named color applies chalk method", () => {
  expect(applyChalk("x", { color: "red" })).toBe(chalk.red("x"));
});

test("hex color applies chalk.hex", () => {
  expect(applyChalk("x", { color: "#ff0000" })).toBe(chalk.hex("#ff0000")("x"));
});

test("non-string color values do not have a tuple-specific styling path", () => {
  expect(applyChalk("x", { color: [255, 0, 0] })).toBe("x");
});

test("unknown color name falls back to no color", () => {
  expect(applyChalk("x", { color: "not-a-real-color" })).toBe("x");
});

test("default colors emit explicit terminal-default spans independently", () => {
  expect(applyChalk("x", { color: "default" })).toBe("\x1b[39mx\x1b[39m");
  expect(applyChalk("x", { backgroundColor: "default" })).toBe("\x1b[49mx\x1b[49m");
});

test("terminal-default colors emit no ANSI when color output is disabled", () => {
  expect(applyTerminalStyle(plainStyle, "x", { color: "default" })).toBe("x");
  expect(applyTerminalStyle(plainStyle, "x", { backgroundColor: "default" })).toBe("x");
});

test("ansi256 foreground color applies chalk.ansi256", () => {
  expect(applyChalk("x", { color: "ansi256(194)" })).toBe(chalk.ansi256(194)("x"));
});

test("ansi256 background color applies chalk.bgAnsi256", () => {
  expect(applyChalk("x", { backgroundColor: "ansi256(194)" })).toBe(chalk.bgAnsi256(194)("x"));
});

// Functional color parsing accepts ansi256(N) only when N is numeric.
test("unparseable ansi256(foo) emits no codes", () => {
  expect(applyChalk("X", { color: "ansi256(foo)" })).toBe("X");
  expect(applyChalk("X", { backgroundColor: "ansi256(foo)" })).toBe("X");
});

test("ansi(194) is not a supported form and emits no codes", () => {
  expect(applyChalk("X", { color: "ansi(194)" })).toBe("X");
  expect(applyChalk("X", { backgroundColor: "ansi(194)" })).toBe("X");
});

test("valid ansi256(194) still colors after hardening", () => {
  expect(applyChalk("X", { color: "ansi256(194)" })).toBe(chalk.ansi256(194)("X"));
  expect(applyChalk("X", { backgroundColor: "ansi256(194)" })).toBe(chalk.bgAnsi256(194)("X"));
});

test("multiple modifiers chain", () => {
  // Each style is its own Chalk wrap in the documented order.
  // bold then underline => underline(bold(x)).
  expect(applyChalk("x", { bold: true, underline: true })).toBe(chalk.underline(chalk.bold("x")));
});

// The nesting order is dim,color,bg,bold,italic,underline,strikethrough,inverse.
test("color+bold nests bold outside color", () => {
  // ESC[1m ESC[31m X ESC[39m ESC[22m
  expect(applyChalk("X", { color: "red", bold: true })).toBe(chalk.bold(chalk.red("X")));
  expect(applyChalk("X", { color: "red", bold: true })).toBe("[1m[31mX[39m[22m");
});

test("dim+bold re-opens bold after dim's SGR-22 reset", () => {
  // ESC[1m ESC[2m X ESC[22m ESC[1m ESC[22m
  expect(applyChalk("X", { dimColor: true, bold: true })).toBe(chalk.bold(chalk.dim("X")));
  expect(applyChalk("X", { dimColor: true, bold: true })).toBe("[1m[2mX[22m[1m[22m");
});

test("color+backgroundColor nests bg outside color", () => {
  // ESC[44m ESC[31m X ESC[39m ESC[49m
  expect(applyChalk("X", { color: "red", backgroundColor: "blue" })).toBe(
    chalk.bgBlue(chalk.red("X")),
  );
  expect(applyChalk("X", { color: "red", backgroundColor: "blue" })).toBe("[44m[31mX[39m[49m");
});

test("level 0 emits no ANSI codes regardless of styles", () => {
  expect(
    applyTerminalStyle(plainStyle, "X", {
      color: "red",
      bold: true,
      backgroundColor: "blue",
    }),
  ).toBe("X");
});

// A Chalk modifier has no matching background method (`chalk.bgBold`, etc.).
// vue-tui rejects it during component render so Vue error handling applies.
test("isInvalidBackgroundColor: chalk modifier names are invalid backgrounds", () => {
  for (const m of [
    "bold",
    "dim",
    "italic",
    "underline",
    "inverse",
    "hidden",
    "strikethrough",
    "reset",
    "overline",
    "visible",
  ]) {
    expect(isInvalidBackgroundColor(m)).toBe(true);
  }
});

test("isInvalidBackgroundColor: real colors / hex / ansi256 / rgb / unknown / empty are valid", () => {
  for (const ok of [
    "red",
    "blue",
    "blackBright",
    "redBright",
    "#ff0000",
    "ansi256(9)",
    "rgb(1,2,3)",
    "not-a-real-color",
    "",
    undefined,
    null,
  ]) {
    expect(isInvalidBackgroundColor(ok)).toBe(false);
  }
});

test("assertValidBackgroundColor throws only for a modifier name, with the label in the message", () => {
  expect(() => assertValidBackgroundColor("bold")).toThrow(/backgroundColor/i);
  expect(() => assertValidBackgroundColor("dim", "borderTopBackgroundColor")).toThrow(
    /borderTopBackgroundColor/,
  );
  // No throw for valid forms.
  expect(() => assertValidBackgroundColor("red")).not.toThrow();
  expect(() => assertValidBackgroundColor("#abcdef")).not.toThrow();
  expect(() => assertValidBackgroundColor("not-a-real-color")).not.toThrow();
  expect(() => assertValidBackgroundColor(undefined)).not.toThrow();
});

test("assertValidForegroundColor throws only for chalk keys that are not methods", () => {
  expect(isInvalidForegroundColor("level")).toBe(true);
  expect(() => assertValidForegroundColor("level")).toThrow(/color/i);
  expect(() => assertValidForegroundColor("level", "borderTopColor")).toThrow(/borderTopColor/);

  // Valid foreground forms and unknown strings keep the bare-text fallback.
  expect(isInvalidForegroundColor("bold")).toBe(false);
  expect(isInvalidForegroundColor("red")).toBe(false);
  expect(isInvalidForegroundColor("#abcdef")).toBe(false);
  expect(isInvalidForegroundColor("not-a-real-color")).toBe(false);
  expect(isInvalidForegroundColor(undefined)).toBe(false);
});

// `color="bold"` resolves to the callable chalk.bold method. Only the background
// path has the missing-bg-method problem.
test("foreground modifier name still applies (no validation on color)", () => {
  expect(applyChalk("X", { color: "bold" })).toBe(chalk.bold("X"));
});
