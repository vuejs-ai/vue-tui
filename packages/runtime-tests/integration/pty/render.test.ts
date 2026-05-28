import { test as it, expect } from "vite-plus/test";
import ansiEscapes from "ansi-escapes";
import stripAnsi from "strip-ansi";
import term from "./helpers/term.ts";
const countOccurrences = (text: string, searchValue: string): number => {
  if (searchValue === "") return 0;
  return text.split(searchValue).length - 1;
};

const getIssue450ControlSequenceCounts = (output: string) => ({
  clearTerminalCount: countOccurrences(output, ansiEscapes.clearTerminal),
  eraseLineCount: (output.match(/\[\d*K/g) || []).length,
});

const runIssue450Fixture = async (fixture: string, rows = 6) => {
  const ps = term(fixture, [String(rows)]);
  await ps.waitForExit();
  return ps.output;
};

const runIssue450FixtureWithCounts = async (fixture: string, rows = 6) => {
  const output = await runIssue450Fixture(fixture, rows);
  const { clearTerminalCount, eraseLineCount } = getIssue450ControlSequenceCounts(output);
  return { output, clearTerminalCount, eraseLineCount };
};

const runIssue450FixtureBeforeMarker = async (fixture: string, marker: string, rows = 6) => {
  const output = await runIssue450Fixture(fixture, rows);
  const markerIndex = output.indexOf(marker);
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  return markerIndex >= 0 ? output.slice(0, markerIndex) : output;
};

it("do not erase screen (content fits viewport)", async () => {
  const ps = term("erase", ["4"]);
  await ps.waitForExit();
  expect(ps.output).not.toContain(ansiEscapes.clearTerminal);

  for (const letter of ["A", "B", "C"]) {
    expect(ps.output).toContain(letter);
  }
});

it("do not erase screen where <Static> is taller than viewport", async () => {
  const ps = term("erase-with-static", ["4"]);
  await ps.waitForExit();
  expect(ps.output).not.toContain(ansiEscapes.clearTerminal);

  for (const letter of ["A", "B", "C", "D", "E", "F"]) {
    expect(ps.output).toContain(letter);
  }
});

it("erase screen (content overflows viewport)", async () => {
  const ps = term("erase", ["3"]);
  await ps.waitForExit();
  expect(ps.output).toContain(ansiEscapes.clearTerminal);

  for (const letter of ["A", "B", "C"]) {
    expect(ps.output).toContain(letter);
  }
});

it("erase screen where <Static> exists but interactive part is taller than viewport", async () => {
  const ps = term("erase-with-static", ["3"]);
  await ps.waitForExit();
  expect(ps.output).toContain(ansiEscapes.clearTerminal);

  for (const letter of ["A", "B", "C", "D", "E", "F"]) {
    expect(ps.output).toContain(letter);
  }
});

it("erase screen where state changes", async () => {
  const ps = term("erase-with-state-change", ["4"]);
  await ps.waitForExit();

  // The final frame is between the last eraseLines sequence and cursorShow
  // Split on cursorShow to isolate the final rendered content before the cursor is shown
  const beforeCursorShow = ps.output.split(ansiEscapes.cursorShow)[0];
  expect(beforeCursorShow).toBeDefined();

  // Find the last occurrence of an eraseLines sequence
  // eraseLines(1) is the minimal erase pattern
  const eraseLinesPattern = ansiEscapes.eraseLines(1);
  const lastEraseIndex = beforeCursorShow!.lastIndexOf(eraseLinesPattern);

  const lastFrame =
    lastEraseIndex === -1
      ? beforeCursorShow!
      : beforeCursorShow!.slice(lastEraseIndex + eraseLinesPattern.length);

  const lastFrameContent = stripAnsi(lastFrame);

  for (const letter of ["A", "B", "C"]) {
    expect(lastFrameContent).not.toContain(letter);
  }
});

it("erase screen where state changes in small viewport", async () => {
  const ps = term("erase-with-state-change", ["3"]);
  await ps.waitForExit();

  const frames = ps.output.split(ansiEscapes.clearTerminal);
  const lastFrame = frames.at(-1);

  for (const letter of ["A", "B", "C"]) {
    expect(lastFrame).not.toContain(letter);
  }
});

it("fullscreen mode should not add extra newline at the bottom", async () => {
  const ps = term("fullscreen-no-extra-newline", ["5"]);
  await ps.waitForExit();

  expect(ps.output).toContain("Bottom line");

  const lastFrame = ps.output.split(ansiEscapes.clearTerminal).at(-1) ?? "";

  // Check that the bottom line is at the end without extra newlines
  // In a 5-line terminal:
  // Line 1: Full-screen: top
  // Lines 2-4: empty (from flexGrow)
  // Line 5: Bottom line (should be usable)
  const lines = lastFrame.split("\n");

  expect(lines).toHaveLength(5);
  expect(lines[4]).toContain("Bottom line");
});

it("#442: full terminal-size box should not add an extra scroll line", async () => {
  const rows = 5;
  const ps = term("issue-442-full-height", [String(rows)]);
  await ps.waitForExit();

  const lastFrame = ps.output.split(ansiEscapes.clearTerminal).at(-1) ?? "";
  const lastFrameContent = stripAnsi(lastFrame);
  const lines = lastFrameContent.split("\n");

  expect(lastFrameContent).not.toMatch(/\n$/);
  expect(lines).toHaveLength(rows);
  expect(lines.at(-1)).toContain("#442 bottom");
});

// ── Issue #450 tests ────────────────────────────────────────────────

it("#450: full-height rerenders should not repeatedly clear terminal", async () => {
  const { output, clearTerminalCount, eraseLineCount } = await runIssue450FixtureWithCounts(
    "issue-450-full-height-rerender",
  );

  expect(output).toContain("frame 8");
  expect(clearTerminalCount).toBeLessThanOrEqual(1);
  expect(eraseLineCount).toBeGreaterThan(0);
});

it("#450: initial overflowing frame should not clear terminal", async () => {
  const renderedMarker = "__INITIAL_OVERFLOW_FRAME_RENDERED__";
  const outputBeforeMarker = await runIssue450FixtureBeforeMarker(
    "issue-450-initial-overflow",
    renderedMarker,
    3,
  );

  expect(outputBeforeMarker).not.toContain(ansiEscapes.clearTerminal);
});

it("#450: initial full-height frame should not clear terminal", async () => {
  const renderedMarker = "__INITIAL_FULLSCREEN_FRAME_RENDERED__";
  const outputBeforeMarker = await runIssue450FixtureBeforeMarker(
    "issue-450-initial-fullscreen",
    renderedMarker,
    3,
  );

  expect(outputBeforeMarker).not.toContain(ansiEscapes.clearTerminal);
});

it("#450: grow from rows - 1 to full-height should not clear before unmount", async () => {
  const renderedMarker = "__GROW_TO_FULLSCREEN_RERENDER_COMPLETED__";
  const outputBeforeMarker = await runIssue450FixtureBeforeMarker(
    "issue-450-grow-to-fullscreen-rerender",
    renderedMarker,
  );
  const { clearTerminalCount } = getIssue450ControlSequenceCounts(outputBeforeMarker);

  expect(outputBeforeMarker).toContain("frame 8");
  expect(clearTerminalCount).toBe(0);
});

it("#450: shrink from full-height to rows - 1 should clear exactly once", async () => {
  const { output, clearTerminalCount } = await runIssue450FixtureWithCounts(
    "issue-450-shrink-from-fullscreen-rerender",
  );

  expect(output).toContain("frame 8");
  expect(clearTerminalCount).toBe(1);
});

it("#450 control: rows - 1 rerenders should avoid clearTerminal", async () => {
  const { clearTerminalCount, eraseLineCount } = await runIssue450FixtureWithCounts(
    "issue-450-height-minus-one-rerender",
  );
  expect(clearTerminalCount).toBe(0);
  expect(eraseLineCount).toBeGreaterThan(0);
});

it("#450: full-height rerenders should not clear before unmount", async () => {
  const outputBeforeMarker = await runIssue450FixtureBeforeMarker(
    "issue-450-full-height-rerender-with-marker",
    "__FULL_HEIGHT_RERENDER_COMPLETED__",
  );
  const { clearTerminalCount } = getIssue450ControlSequenceCounts(outputBeforeMarker);
  expect(clearTerminalCount).toBe(0);
});

it("#450: shrink from overflow to rows - 1 should clear exactly once", async () => {
  const { clearTerminalCount } = await runIssue450FixtureWithCounts(
    "issue-450-shrink-from-overflow-rerender",
  );
  expect(clearTerminalCount).toBe(1);
});

it("#450: <Static> with shrink from full-height should clear exactly once", async () => {
  const { output, clearTerminalCount } = await runIssue450FixtureWithCounts(
    "issue-450-static-shrink-from-fullscreen-rerender",
  );
  expect(output).toContain("#450 static line");
  expect(clearTerminalCount).toBe(1);
});

it("#450: full-height rerenders with <Static> should not repeatedly clear terminal", async () => {
  const { output, clearTerminalCount, eraseLineCount } = await runIssue450FixtureWithCounts(
    "issue-450-full-height-with-static-rerender",
  );
  expect(output).toContain("#450 static line");
  expect(clearTerminalCount).toBeLessThanOrEqual(1);
  expect(eraseLineCount).toBeGreaterThan(0);
});

// ── Animation exit tests ────────────────────────────────────────────

it("useAnimation can drive non-interactive process exit", async () => {
  const ps = term("use-animation-non-interactive-exit");
  try {
    await ps.waitForExit();
  } catch {
    // yoga WASM cleanup crash causes non-zero exit after successful operation
  }
  const plainOutput = stripAnsi(ps.output);

  expect(plainOutput).toContain("exited");
});

it("useAnimation can drive explicitly non-interactive process exit", async () => {
  const ps = term("use-animation-interactive-false-exit");
  try {
    await ps.waitForExit();
  } catch {
    // yoga WASM cleanup crash causes non-zero exit after successful operation
  }
  const plainOutput = stripAnsi(ps.output);

  expect(plainOutput).toContain("exited");
});
