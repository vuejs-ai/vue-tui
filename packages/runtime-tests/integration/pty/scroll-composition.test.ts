import headless from "@xterm/headless";
import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

const { Terminal } = headless;
const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const ENABLE_BRACKETED_PASTE = "\x1b[?2004h";
const DISABLE_BRACKETED_PASTE = "\x1b[?2004l";
const ENABLE_KITTY_KEYBOARD = "\x1b[>1u";
const DISABLE_KITTY_KEYBOARD = "\x1b[<u";
const ENABLE_BUTTON_MOUSE = "\x1b[?1000h";
const DISABLE_BUTTON_MOUSE = "\x1b[?1000l";
const ENABLE_SGR_MOUSE = "\x1b[?1006h";
const DISABLE_SGR_MOUSE = "\x1b[?1006l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const WHEEL_DOWN_AT_INNER = "\x1b[<65;2;7M";
const WHEEL_UP_AT_INNER = "\x1b[<64;2;7M";
const keyboardTrace = [
  "inner:down:moved",
  "inner:end:moved",
  "inner:down:unchanged",
  "outer:down:moved",
  "inner:up:moved",
  "inner:home:moved",
  "inner:home:unchanged",
  "outer:home:moved",
] as const;
const wheelTrace = [
  "inner:down:moved",
  "inner:target:down:moved",
  "inner:end:moved",
  "inner:target:down:unchanged",
  "outer:bubble:down:moved",
  "inner:target:up:moved",
] as const;

function occurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

async function emulate(output: string): Promise<InstanceType<typeof Terminal>> {
  const terminal = new Terminal({ cols: 100, rows: 24, allowProposedApi: true });
  await new Promise<void>((resolve) => terminal.write(output, resolve));
  return terminal;
}

async function expectVisible(
  output: string,
  included: readonly string[],
  excluded: readonly string[] = [],
): Promise<void> {
  const terminal = await emulate(output);
  try {
    const buffer = terminal.buffer.active;
    const visible = Array.from({ length: terminal.rows }, (_, index) =>
      (buffer.getLine(buffer.viewportY + index)?.translateToString(true) ?? "").trimEnd(),
    ).join("\n");
    for (const value of included) expect(visible).toContain(value);
    for (const value of excluded) expect(visible).not.toContain(value);
  } finally {
    terminal.dispose();
  }
}

function expectExactCleanup(output: string, mode: "inline" | "fullscreen"): void {
  const completion = output.indexOf("__SCROLL_COMPOSITION_OK__");
  expect(completion).toBeGreaterThan(-1);
  for (const [enable, disable] of [
    [ENABLE_BRACKETED_PASTE, DISABLE_BRACKETED_PASTE],
    [ENABLE_KITTY_KEYBOARD, DISABLE_KITTY_KEYBOARD],
  ] as const) {
    expect(occurrences(output, enable)).toBe(1);
    expect(occurrences(output, disable)).toBe(1);
    expect(output.lastIndexOf(disable)).toBeGreaterThan(output.lastIndexOf(enable));
    expect(output.lastIndexOf(disable)).toBeLessThan(completion);
  }
  expect(output).toContain(HIDE_CURSOR);
  expect(output.lastIndexOf(SHOW_CURSOR)).toBeGreaterThan(output.lastIndexOf(HIDE_CURSOR));
  expect(output.lastIndexOf(SHOW_CURSOR)).toBeLessThan(completion);

  if (mode === "fullscreen") {
    for (const [enable, disable] of [
      [ENABLE_BUTTON_MOUSE, DISABLE_BUTTON_MOUSE],
      [ENABLE_SGR_MOUSE, DISABLE_SGR_MOUSE],
      [ENTER_ALT_SCREEN, EXIT_ALT_SCREEN],
    ] as const) {
      expect(occurrences(output, enable)).toBe(1);
      expect(occurrences(output, disable)).toBe(1);
      expect(output.lastIndexOf(disable)).toBeGreaterThan(output.lastIndexOf(enable));
      expect(output.lastIndexOf(disable)).toBeLessThan(completion);
    }
    expect(output).not.toContain("\x1b[?1002h");
  } else {
    expect(output).not.toContain(ENTER_ALT_SCREEN);
    expect(output).not.toContain(EXIT_ALT_SCREEN);
    expect(output).not.toContain(ENABLE_BUTTON_MOUSE);
    expect(output).not.toContain(ENABLE_SGR_MOUSE);
  }
}

test.each(["inline", "fullscreen"] as const)(
  "nested keyboard scrolling composes through a real %s terminal",
  async (mode) => {
    const ps = term("scroll-composition", [mode, "keyboard"], { name: "xterm-256color" });
    try {
      await ps.waitForOutput(
        (output) =>
          output.includes("__READY__") &&
          output.includes(`Scroll composition (${mode})`) &&
          output.includes("route=ready") &&
          output.includes("inner 2") &&
          output.includes("inner 4"),
      );
      await expectVisible(ps.output, ["outer 1", "inner 2", "inner 3", "inner 4"]);

      let before = ps.output.length;
      ps.write("\x1b[B");
      await ps.waitForOutput((output) => output.slice(before).includes("route=inner:down:moved"));
      await expectVisible(ps.output, ["outer 1", "inner 3", "inner 4", "inner 5"]);

      before = ps.output.length;
      ps.write("\x1b[F");
      await ps.waitForOutput((output) => output.slice(before).includes("route=inner:end:moved"));
      await expectVisible(ps.output, ["outer 1", "inner 5", "inner 6", "inner 7"]);

      before = ps.output.length;
      ps.write("\x1b[B");
      await ps.waitForOutput((output) =>
        output.slice(before).includes("route=inner:down:unchanged > outer:down:moved"),
      );
      await expectVisible(ps.output, ["inner 5", "inner 6", "inner 7"], ["outer 1"]);

      before = ps.output.length;
      ps.write("\x1b[A");
      await ps.waitForOutput((output) => output.slice(before).includes("route=inner:up:moved"));
      await expectVisible(ps.output, ["inner 4", "inner 5", "inner 6"], ["outer 1"]);

      before = ps.output.length;
      ps.write("\x1b[H");
      await ps.waitForOutput((output) => output.slice(before).includes("route=inner:home:moved"));
      await expectVisible(ps.output, ["inner 0", "inner 1", "inner 2"], ["outer 1"]);

      before = ps.output.length;
      ps.write("\x1b[H");
      await ps.waitForOutput((output) =>
        output.slice(before).includes("route=inner:home:unchanged > outer:home:moved"),
      );
      await expectVisible(ps.output, ["outer 0", "outer 1", "inner 0", "inner 2"]);

      ps.write("q");
      await ps.waitForOutput((output) => output.includes("__SCROLL_COMPOSITION_OK__"));
      await ps.waitForExit();
      expect(ps.output).toContain(`__TRACE__${JSON.stringify(keyboardTrace)}__`);
      expectExactCleanup(ps.output, mode);

      const restored = await emulate(ps.output);
      try {
        expect(restored.buffer.active.type).toBe("normal");
        expect(restored.modes.bracketedPasteMode).toBe(false);
        expect(restored.modes.mouseTrackingMode).toBe("none");
      } finally {
        restored.dispose();
      }
    } finally {
      ps.killNow("SIGKILL");
    }
  },
);

test("nested wheel scrolling uses real SGR input and bubbles only at the inner edge", async () => {
  const ps = term("scroll-composition", ["fullscreen", "wheel"], { name: "xterm-256color" });
  try {
    await ps.waitForOutput(
      (output) =>
        output.includes("__READY__") &&
        output.includes("Scroll composition (fullscreen)") &&
        output.includes(ENABLE_BUTTON_MOUSE) &&
        output.includes(ENABLE_SGR_MOUSE),
    );
    await expectVisible(ps.output, ["outer 1", "inner 2", "inner 3", "inner 4"]);

    let before = ps.output.length;
    ps.write("\x1b[B");
    await ps.waitForOutput((output) => output.slice(before).includes("route=inner:down:moved"));
    await expectVisible(ps.output, ["inner 3", "inner 4", "inner 5"]);

    before = ps.output.length;
    ps.write(WHEEL_DOWN_AT_INNER);
    await ps.waitForOutput((output) =>
      output.slice(before).includes("route=inner:target:down:moved"),
    );
    await expectVisible(ps.output, ["inner 4", "inner 5", "inner 6", "outer 1"]);

    before = ps.output.length;
    ps.write("\x1b[F");
    await ps.waitForOutput((output) => output.slice(before).includes("route=inner:end:moved"));
    await expectVisible(ps.output, ["inner 5", "inner 6", "inner 7", "outer 1"]);

    before = ps.output.length;
    ps.write(WHEEL_DOWN_AT_INNER);
    await ps.waitForOutput((output) =>
      output.slice(before).includes("route=inner:target:down:unchanged > outer:bubble:down:moved"),
    );
    await expectVisible(ps.output, ["inner 5", "inner 6", "inner 7"], ["outer 1"]);

    before = ps.output.length;
    ps.write(WHEEL_UP_AT_INNER);
    await ps.waitForOutput((output) =>
      output.slice(before).includes("route=inner:target:up:moved"),
    );
    await expectVisible(ps.output, ["inner 4", "inner 5", "inner 6"], ["outer 1"]);

    ps.write("q");
    await ps.waitForOutput((output) => output.includes("__SCROLL_COMPOSITION_OK__"));
    await ps.waitForExit();
    expect(ps.output).toContain(`__TRACE__${JSON.stringify(wheelTrace)}__`);
    expectExactCleanup(ps.output, "fullscreen");

    const restored = await emulate(ps.output);
    try {
      expect(restored.buffer.active.type).toBe("normal");
      expect(restored.modes.bracketedPasteMode).toBe(false);
      expect(restored.modes.mouseTrackingMode).toBe("none");
    } finally {
      restored.dispose();
    }
  } finally {
    ps.killNow("SIGKILL");
  }
});
