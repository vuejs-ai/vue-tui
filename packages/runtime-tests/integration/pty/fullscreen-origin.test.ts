import headless from "@xterm/headless";
import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

const { Terminal } = headless;

type SurfaceScenario =
  | "console"
  | "rerender"
  | "overflow"
  | "horizontal-overflow"
  | "horizontal-left-wide"
  | "horizontal-wide";

async function emulate(output: string, rows = 8): Promise<InstanceType<typeof Terminal>> {
  const terminal = new Terminal({ cols: 100, rows, allowProposedApi: true });
  await new Promise<void>((resolve) => terminal.write(output, resolve));
  return terminal;
}

function visibleLines(terminal: InstanceType<typeof Terminal>): string[] {
  const buffer = terminal.buffer.active;
  return Array.from({ length: terminal.rows }, (_, row) =>
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
            : scenario === "horizontal-left-wide"
              ? " x"
              : scenario === "horizontal-wide"
                ? "X".repeat(99)
                : "BUTTON";

    expect(lines[0]).toBe(expected);
    if (scenario === "overflow") {
      expect(lines[7]).toBe("LINE7");
      expect(lines).not.toContain("LINE8");
      expect(lines).not.toContain("LINE9");
    } else if (
      scenario === "horizontal-overflow" ||
      scenario === "horizontal-left-wide" ||
      scenario === "horizontal-wide"
    ) {
      expect(lines.slice(1).every((line) => line === "")).toBe(true);
    } else {
      expect(lines.slice(1)).not.toContain("BUTTON");
      expect(lines.slice(1)).not.toContain("UPDATED");
    }
    expect(ps.output).toContain("\x1b[?25l\x1b[2J\x1b[H");

    const sideChannels: Partial<Record<SurfaceScenario, string>> = { console: "CONSOLE" };
    const expectedSideChannel = sideChannels[scenario];
    if (expectedSideChannel) expect(ps.output).toContain(expectedSideChannel);

    ps.write("q");
    await ps.waitForOutput((output) => output.includes(`__EXITED__:${scenario}`));
    await ps.waitForExit();
    exited = true;
  } finally {
    if (!exited) ps.kill("SIGTERM");
  }
}

test("fullscreen Static rejects after restoring a setup-owned terminal surface", async () => {
  const ps = term("fullscreen-origin", ["8", "static"]);
  let exited = false;

  try {
    await ps.waitForOutput((output) => output.includes("__STATIC_REJECTED__:"));
    await ps.waitForExit();
    exited = true;

    const output = ps.output;
    const enterIndex = output.indexOf("\x1b[?1049h");
    const exitIndex = output.lastIndexOf("\x1b[?1049l");
    const pasteEnableIndex = output.indexOf("\x1b[?2004h");
    const pasteDisableIndex = output.lastIndexOf("\x1b[?2004l");
    const showCursorIndex = output.lastIndexOf("\x1b[?25h");
    const reportIndex = output.indexOf(
      "[vue-tui] <Static> cannot render on an effective visual Fullscreen surface",
    );
    const markerIndex = output.indexOf("__STATIC_REJECTED__:");

    expect(enterIndex).toBeGreaterThanOrEqual(0);
    expect(exitIndex).toBeGreaterThan(enterIndex);
    expect(pasteEnableIndex).toBeGreaterThan(enterIndex);
    expect(pasteDisableIndex).toBeGreaterThan(pasteEnableIndex);
    expect(showCursorIndex).toBeGreaterThan(exitIndex);
    expect(reportIndex).toBeGreaterThan(Math.max(exitIndex, pasteDisableIndex, showCursorIndex));
    expect(markerIndex).toBeGreaterThan(reportIndex);
    expect(output).not.toContain("HISTORY");
    expect(output).not.toContain("BUTTON");
    expect(output).not.toContain("output is not retained in fullscreen mode");
  } finally {
    if (!exited) ps.kill("SIGTERM");
  }
});

test("fullscreen patched console output does not move the live surface", async () => {
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

test("fullscreen left clipping preserves the column after a straddling wide glyph", async () => {
  await assertStableFullscreenSurface("horizontal-left-wide");
});
