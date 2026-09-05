import { expect, test } from "vite-plus/test";
import { resolveColorCapability } from "../../src/frame/color-profile.ts";

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
  const capability = resolveColorCapability({
    color: true,
    stdout: ttyWithDepth(depth),
    environment: {},
  });

  expect(capability).toEqual({ attributes: level > 0, level });
});

test("disables ANSI for a non-TTY stream by default", () => {
  const capability = resolveColorCapability({
    color: true,
    stdout: { isTTY: false },
    environment: {},
  });

  expect(capability).toEqual({ attributes: false, level: 0 });
});

test("NO_COLOR removes colors without removing non-color text attributes", () => {
  const capability = resolveColorCapability({
    color: true,
    stdout: ttyWithDepth(24),
    environment: { NO_COLOR: "1" },
  });

  expect(capability).toEqual({ attributes: true, level: 0 });
});

test("an empty NO_COLOR value is absent", () => {
  const capability = resolveColorCapability({
    color: true,
    stdout: ttyWithDepth(24),
    environment: { NO_COLOR: "" },
  });

  expect(capability).toEqual({ attributes: true, level: 3 });
});

test("FORCE_COLOR wins over NO_COLOR", () => {
  const capability = resolveColorCapability({
    color: true,
    stdout: ttyWithDepth(4),
    environment: {
      FORCE_COLOR: "2",
      NO_COLOR: "1",
      NODE_DISABLE_COLORS: "1",
      TERM: "xterm-256color",
    },
  });

  expect(capability).toEqual({ attributes: true, level: 2 });
});

test.each([
  [false, 0],
  ["ansi16", 1],
  ["ansi256", 2],
  ["truecolor", 3],
] as const)("explicit color %s selects level %i", (color, level) => {
  expect(resolveColorCapability({ color })).toEqual({ attributes: level > 0, level });
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

  expect(resolveColorCapability(explicitInput)).toEqual({ attributes: true, level: 1 });
});
