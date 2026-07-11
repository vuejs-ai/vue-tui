import headless from "@xterm/headless";
import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

const { Terminal } = headless;

type SurfaceScenario =
  | "static"
  | "stdout"
  | "stderr"
  | "console"
  | "rerender"
  | "overflow"
  | "horizontal-overflow"
  | "horizontal-wide"
  | "horizontal-transform";

async function emulate(output: string): Promise<InstanceType<typeof Terminal>> {
  const terminal = new Terminal({ cols: 100, rows: 8, allowProposedApi: true });
  await new Promise<void>((resolve) => terminal.write(output, resolve));
  return terminal;
}

function visibleLines(terminal: InstanceType<typeof Terminal>): string[] {
  const buffer = terminal.buffer.active;
  return Array.from({ length: terminal.rows }, (_, row) =>
    (buffer.getLine(row)?.translateToString(true) ?? "").trimEnd(),
  );
}

function allBufferLines(terminal: InstanceType<typeof Terminal>): string[] {
  const buffer = terminal.buffer.active;
  return Array.from({ length: buffer.length }, (_, row) =>
    (buffer.getLine(row)?.translateToString(true) ?? "").trimEnd(),
  );
}

async function assertStableFullscreenSurface(scenario: SurfaceScenario) {
  const ps = term("fullscreen-origin", ["8", scenario]);
  let exited = false;

  try {
    await ps.waitForOutput((output) => output.includes(`__SETTLED__:${scenario}`));

    const terminal = await emulate(ps.output);
    const lines = visibleLines(terminal);
    const expected =
      scenario === "rerender"
        ? "UPDATED"
        : scenario === "overflow"
          ? "LINE0"
          : scenario === "horizontal-overflow"
            ? "X".repeat(100)
            : scenario === "horizontal-wide"
              ? "X".repeat(99)
              : scenario === "horizontal-transform"
                ? "Y".repeat(100)
                : "BUTTON";

    expect(lines[0]).toBe(expected);
    if (scenario === "overflow") {
      expect(lines[7]).toBe("LINE7");
      expect(lines).not.toContain("LINE8");
      expect(lines).not.toContain("LINE9");
    } else if (
      scenario === "horizontal-overflow" ||
      scenario === "horizontal-wide" ||
      scenario === "horizontal-transform"
    ) {
      expect(lines.slice(1).every((line) => line === "")).toBe(true);
    } else {
      expect(lines.slice(1)).not.toContain("BUTTON");
      expect(lines.slice(1)).not.toContain("UPDATED");
    }
    expect(terminal.buffer.active.cursorX).toBe(3);
    expect(terminal.buffer.active.cursorY).toBe(0);
    expect(ps.output).toContain("\x1b[?25l\x1b[2J\x1b[H");

    const sideChannels: Partial<Record<SurfaceScenario, string>> = {
      static: "HISTORY",
      stdout: "LOG",
      stderr: "ERROR",
      console: "CONSOLE",
    };
    const expectedSideChannel = sideChannels[scenario];
    if (expectedSideChannel) {
      expect(ps.output).toContain(expectedSideChannel);
    }

    // SGR mouse coordinates are 1-based on the wire. Click the element where
    // it is visibly rendered: the first cell of the first terminal row.
    ps.write("\x1b[<0;1;1M\x1b[<0;1;1m");
    await ps.waitForOutput((output) => output.includes("__CLICKED__:clicked"));
    await ps.waitForExit();
    if (scenario === "static") {
      expect(ps.output.match(/\[vue-tui\] <Static> output/g)?.length).toBe(1);
    }
    exited = true;
  } finally {
    if (!exited) ps.kill("SIGTERM");
  }
}

test("fullscreen Static output does not move the live surface away from its hit map", async () => {
  await assertStableFullscreenSurface("static");
});

test("fullscreen useStdout output does not move the live surface away from its hit map", async () => {
  await assertStableFullscreenSurface("stdout");
});

test("fullscreen useStderr output does not move the live surface away from its hit map", async () => {
  await assertStableFullscreenSurface("stderr");
});

test("fullscreen patched console output does not move the live surface away from its hit map", async () => {
  await assertStableFullscreenSurface("console");
});

test("fullscreen rerenders replace the live surface instead of appending", async () => {
  await assertStableFullscreenSurface("rerender");
});

test("fullscreen clips an overflowing tree to the addressable viewport", async () => {
  await assertStableFullscreenSurface("overflow");
});

test("fullscreen clips wide paint before the terminal can wrap it onto another row", async () => {
  await assertStableFullscreenSurface("horizontal-overflow");
});

test("fullscreen drops a wide glyph that crosses the viewport's right edge", async () => {
  await assertStableFullscreenSurface("horizontal-wide");
});

test("fullscreen hard-clips text expanded by a paint transform", async () => {
  await assertStableFullscreenSurface("horizontal-transform");
});

test("fullscreen screen-reader request uses a main-screen linear transcript", async () => {
  const ps = term("fullscreen-origin", ["8", "screen-reader"]);
  let exited = false;

  try {
    await ps.waitForOutput((output) => output.includes("__SETTLED__:screen-reader"));
    expect(ps.output).not.toContain("\x1b[2J\x1b[H");
    expect(ps.output).not.toContain("\x1b[?1049h");
    expect(ps.output).not.toContain("\x1b[?1049l");
    expect(ps.output).not.toContain("\x1b[?25l");
    expect(ps.output).not.toContain("\x1b[?1000h");
    expect(ps.output).not.toContain("\x1b[?1002h");
    expect(ps.output).not.toContain("\x1b[?1003h");

    const terminal = await emulate(ps.output);
    expect(terminal.buffer.active.type).toBe("normal");
    expect(allBufferLines(terminal)).toContain("__READY__");
    expect(visibleLines(terminal)).toContain("BUTTON");

    // A real targeted handler is mounted above. Even when mouse bytes are fed
    // directly into the PTY, screen-reader fallback must neither arm reporting
    // nor deliver the event through a hidden full-screen hit map.
    ps.write("\x1b[<0;1;1M\x1b[<0;1;1mq");
    await ps.waitForOutput((output) => output.includes("__CLICKED__:"));
    await ps.waitForExit();
    exited = true;

    expect(ps.output).toContain("__CLICKED__:screen-reader");
    expect(ps.output).not.toContain("__CLICKED__:screen-reader-pointer");
    expect(ps.output).not.toContain("\x1b[?1000h");
    expect(ps.output).not.toContain("\x1b[?1002h");
    expect(ps.output).not.toContain("\x1b[?1003h");

    const restored = await emulate(ps.output);
    expect(restored.buffer.active.type).toBe("normal");
    expect(allBufferLines(restored)).toContain("__READY__");
    expect(allBufferLines(restored).some((line) => line.includes("BUTTON"))).toBe(true);
  } finally {
    if (!exited) ps.kill("SIGTERM");
  }
});
