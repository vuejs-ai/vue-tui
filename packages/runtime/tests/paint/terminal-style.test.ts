import { expect, test } from "vite-plus/test";
import { createTerminalStyle, resolveTerminalStyle } from "../../src/paint/terminal-style.ts";
import { applyChalk } from "../../src/paint/text-style.ts";

function ttyWithDepth(depth: number) {
  return {
    isTTY: true,
    colorDepth: depth,
  };
}

test.each([
  [1, 0],
  [4, 1],
  [8, 2],
  [24, 3],
] as const)("maps a TTY color depth of %i bits to color level %i", (depth, level) => {
  const style = resolveTerminalStyle({ color: true, stdout: ttyWithDepth(depth), environment: {} });
  expect(style.chalk.level).toBe(level);
  expect(style.colorLevel).toBe(level);
});

test("disables ANSI for a non-TTY stream by default", () => {
  const style = resolveTerminalStyle({ color: true, stdout: { isTTY: false }, environment: {} });
  expect(style.chalk.level).toBe(0);
  expect(style.colorLevel).toBe(0);
});

test("NO_COLOR removes colors without removing non-color text attributes", () => {
  const style = resolveTerminalStyle({
    color: true,
    stdout: ttyWithDepth(24),
    environment: { NO_COLOR: "1" },
  });
  expect(style.chalk.level).toBe(3);
  expect(style.colorLevel).toBe(0);
  expect(applyChalk(style, "value", { bold: true, color: "red" })).toBe(style.chalk.bold("value"));
});

test("an empty NO_COLOR value is absent", () => {
  const style = resolveTerminalStyle({
    color: true,
    stdout: ttyWithDepth(24),
    environment: { NO_COLOR: "" },
  });
  expect(style.chalk.level).toBe(3);
  expect(style.colorLevel).toBe(3);
});

test("FORCE_COLOR wins over NO_COLOR", () => {
  const style = resolveTerminalStyle({
    color: true,
    stdout: ttyWithDepth(4),
    environment: {
      FORCE_COLOR: "2",
      NO_COLOR: "1",
      NODE_DISABLE_COLORS: "1",
      TERM: "xterm-256color",
    },
  });

  expect(style.chalk.level).toBe(2);
  expect(style.colorLevel).toBe(2);
});

test.each([
  [false, 0],
  ["ansi16", 1],
  ["ansi256", 2],
  ["truecolor", 3],
] as const)("explicit color %s selects level %i", (color, level) => {
  const style = resolveTerminalStyle({ color });

  expect(style.chalk.level).toBe(level);
  expect(style.colorLevel).toBe(level);
});

test("explicit false removes colors and non-color SGR attributes", () => {
  const style = resolveTerminalStyle({ color: false });

  expect(applyChalk(style, "value", { bold: true, color: "red" })).toBe("value");
});

test("an explicit profile does not inspect environment or stream color capability", () => {
  const explicitInput = Object.defineProperties(
    { color: "ansi16" as const },
    {
      stdout: {
        get() {
          throw new Error("automatic stdout must not be read");
        },
      },
      environment: {
        get() {
          throw new Error("automatic environment must not be read");
        },
      },
    },
  );

  const style = resolveTerminalStyle(explicitInput);

  expect(style.chalk.level).toBe(1);
  expect(style.colorLevel).toBe(1);
});

test("a terminal style cannot drift away from its paint-cache identity", () => {
  const style = createTerminalStyle(3);

  expect(Reflect.set(style.chalk, "level", 0)).toBe(false);
  expect(style.chalk.level).toBe(3);
  expect(style.cacheKey).toBe("3:3");
});
