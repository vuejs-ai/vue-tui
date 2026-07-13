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
  | "horizontal-left-wide"
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
            : scenario === "horizontal-left-wide"
              ? " x"
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
      scenario === "horizontal-left-wide" ||
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

test("fullscreen left clipping preserves the column after a straddling wide glyph", async () => {
  await assertStableFullscreenSurface("horizontal-left-wide");
});

test("fullscreen hard-clips text expanded by a paint transform", async () => {
  await assertStableFullscreenSurface("horizontal-transform");
});

test("fullscreen target behavior follows a stable component ref's rendered host lifetime", async () => {
  const ps = term("fullscreen-origin", ["8", "target-lifetime", "auto-exit"]);
  let exited = false;

  try {
    await ps.waitForOutput((output) => output.includes("__SETTLED__:target-lifetime"));
    expect(ps.output).not.toContain("\x1b[?1002h\x1b[?1006h");
    let terminal = await emulate(ps.output);
    expect(visibleLines(terminal)).toContain("phase=none");
    expect(visibleLines(terminal)).toContain("target=0x0:false dragging=false");

    let before = ps.output.length;
    ps.write("1");
    await ps.waitForOutput((output) => output.includes("__TARGET__:first"));
    expect(ps.output.slice(before)).toContain("\x1b[?1002h\x1b[?1006h");
    terminal = await emulate(ps.output);
    expect(visibleLines(terminal)).toContain("FIRST");
    expect(visibleLines(terminal)).toContain("target=7x2:true dragging=false");

    before = ps.output.length;
    ps.write("2");
    await ps.waitForOutput((output) => output.includes("__TARGET__:second"));
    const retargetOutput = ps.output.slice(before);
    expect(retargetOutput).toContain("\x1b[?1002l\x1b[?1006l");
    expect(retargetOutput.lastIndexOf("\x1b[?1002h\x1b[?1006h")).toBeGreaterThan(
      retargetOutput.lastIndexOf("\x1b[?1002l\x1b[?1006l"),
    );
    terminal = await emulate(ps.output);
    expect(visibleLines(terminal)).toContain("     TARGET-B");
    expect(visibleLines(terminal)).toContain("target=11x1:true dragging=false");

    // Send the old-origin down without its matching up, then ask the app for a
    // synchronization marker. A stale registration would leave dragging true
    // and increment the durable start count before the probe key is handled.
    before = ps.output.length;
    ps.write("\x1b[<0;1;2Mp");
    await ps.waitForOutput((output) => output.slice(before).includes("__DRAG_STARTS__:0"));
    terminal = await emulate(ps.output);
    expect(visibleLines(terminal)).toContain("target=11x1:true dragging=false");

    // Release the unmatched old-origin probe, then prove the replacement at
    // x=5 has exactly one live registration by observing one start callback.
    ps.write("\x1b[<0;1;2m");
    before = ps.output.length;
    ps.write("\x1b[<0;6;2M");
    await ps.waitForOutput((output) => output.slice(before).includes("dragging=true"));
    before = ps.output.length;
    ps.write("p");
    await ps.waitForOutput((output) => output.slice(before).includes("__DRAG_STARTS__:1"));
    before = ps.output.length;
    ps.write("\x1b[<0;6;2m");
    await ps.waitForOutput((output) => output.slice(before).includes("dragging=false"));

    // Begin another drag on the replacement, then remove its inner host while
    // the component ref itself remains non-null. Removal must release capture
    // and terminal mouse mode immediately. The PTY-only auto-exit avoids asking
    // the test transport for another key after the app has disabled reporting;
    // the visual-controller scenario remains manual.
    before = ps.output.length;
    ps.write("\x1b[<0;6;2M");
    await ps.waitForOutput((output) => output.slice(before).includes("dragging=true"));
    before = ps.output.length;
    ps.write("x");
    await ps.waitForOutput((output) => output.slice(before).includes("__TARGET__:none"));
    const removalOutput = ps.output.slice(before);
    expect(removalOutput).toContain("\x1b[?1002l\x1b[?1006l");
    const removalMarker = "\x1b]0;__TARGET__:none\x07";
    const removalEnd = ps.output.indexOf(removalMarker, before) + removalMarker.length;
    terminal = await emulate(ps.output.slice(0, removalEnd));
    expect(visibleLines(terminal)).toContain("target=0x0:false dragging=false");

    await ps.waitForOutput((output) => output.includes("__CLICKED__:target-lifetime"));
    await ps.waitForExit();
    exited = true;
    expect(ps.output).toContain("\x1b[?1002l\x1b[?1006l");
  } finally {
    if (!exited) ps.kill("SIGTERM");
  }
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
