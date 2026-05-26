import { test, expect } from "vite-plus/test";
import ansiEscapes from "ansi-escapes";
import stripAnsi from "strip-ansi";
import term from "./helpers/term.ts";

test.sequential("do not erase screen (content fits viewport)", async () => {
  const ps = term("erase", ["4"]);
  await ps.waitForExit();
  expect(ps.output).not.toContain(ansiEscapes.clearTerminal);

  for (const letter of ["A", "B", "C"]) {
    expect(ps.output).toContain(letter);
  }
});

test.sequential("do not erase screen where <Static> is taller than viewport", async () => {
  const ps = term("erase-with-static", ["4"]);
  await ps.waitForExit();
  expect(ps.output).not.toContain(ansiEscapes.clearTerminal);

  for (const letter of ["A", "B", "C", "D", "E", "F"]) {
    expect(ps.output).toContain(letter);
  }
});

test.sequential("erase screen (content overflows viewport)", async () => {
  const ps = term("erase", ["3"]);
  await ps.waitForExit();
  expect(ps.output).toContain(ansiEscapes.clearTerminal);

  for (const letter of ["A", "B", "C"]) {
    expect(ps.output).toContain(letter);
  }
});

test.sequential(
  "erase screen where <Static> exists but interactive part is taller than viewport",
  async () => {
    const ps = term("erase", ["3"]);
    await ps.waitForExit();
    expect(ps.output).toContain(ansiEscapes.clearTerminal);

    for (const letter of ["A", "B", "C"]) {
      expect(ps.output).toContain(letter);
    }
  },
);

test.sequential("erase screen where state changes", async () => {
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

test.sequential("erase screen where state changes in small viewport", async () => {
  const ps = term("erase-with-state-change", ["3"]);
  await ps.waitForExit();

  const frames = ps.output.split(ansiEscapes.clearTerminal);
  const lastFrame = frames.at(-1);

  for (const letter of ["A", "B", "C"]) {
    expect(lastFrame).not.toContain(letter);
  }
});

test.sequential("fullscreen mode should not add extra newline at the bottom", async () => {
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

test.sequential(
  "#442: full terminal-size box should not add an extra scroll line",
  async () => {
    const rows = 5;
    const ps = term("issue-442-full-height", [String(rows)]);
    await ps.waitForExit();

    const lastFrame = ps.output.split(ansiEscapes.clearTerminal).at(-1) ?? "";
    const lastFrameContent = stripAnsi(lastFrame);
    const lines = lastFrameContent.split("\n");

    expect(lastFrameContent).not.toMatch(/\n$/);
    expect(lines).toHaveLength(rows);
    expect(lines.at(-1)).toContain("#442 bottom");
  },
);
