import { test as it, expect } from "vite-plus/test";
import ansiEscapes from "ansi-escapes";
import headless from "@xterm/headless";
import stripAnsi from "strip-ansi";
import term from "./helpers/term.ts";
const { Terminal } = headless;
const forbiddenMainScreenResets = ["\x1b[2J", "\x1b[3J", "\x1b[H"] as const;

const expectNoMainScreenReset = (output: string) => {
  for (const reset of forbiddenMainScreenResets) expect(output).not.toContain(reset);
};

const emulateNormalLines = async (output: string, rows: number): Promise<string[]> => {
  const terminal = new Terminal({ cols: 100, rows, scrollback: 1000, allowProposedApi: true });
  await new Promise<void>((resolve) => terminal.write(output, resolve));
  const buffer = terminal.buffer.normal;
  return Array.from({ length: buffer.length }, (_, row) =>
    (buffer.getLine(row)?.translateToString(true) ?? "").trimEnd(),
  );
};
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
  expectNoMainScreenReset(ps.output);

  for (const letter of ["A", "B", "C"]) {
    expect(ps.output).toContain(letter);
  }
});

it("do not erase screen where <Static> is taller than viewport", async () => {
  const ps = term("erase-with-static", ["4"]);
  await ps.waitForExit();
  expectNoMainScreenReset(ps.output);

  for (const letter of ["A", "B", "C", "D", "E", "F"]) {
    expect(ps.output).toContain(letter);
  }
});

it("full-height Inline teardown does not reset terminal history", async () => {
  const ps = term("erase", ["3"]);
  await ps.waitForExit();
  expectNoMainScreenReset(ps.output);

  for (const letter of ["A", "B", "C"]) {
    expect(ps.output).toContain(letter);
  }
});

it("Static history and a full-height Inline region do not reset terminal history", async () => {
  const ps = term("erase-with-static", ["3"]);
  await ps.waitForExit();
  expectNoMainScreenReset(ps.output);

  for (const letter of ["A", "B", "C", "D", "E", "F"]) {
    expect(ps.output).toContain(letter);
  }
});

it("erase screen where state changes", async () => {
  const ps = term("erase-with-state-change", ["4"]);
  await ps.waitForExit();
  expectNoMainScreenReset(ps.output);
  const finalScreen = (await emulateNormalLines(ps.output, 4)).join("\n");

  for (const letter of ["A", "B", "C"]) {
    expect(finalScreen).not.toContain(letter);
  }
});

it("erase screen where state changes in small viewport", async () => {
  const ps = term("erase-with-state-change", ["3"]);
  await ps.waitForExit();
  expectNoMainScreenReset(ps.output);
  const finalScreen = (await emulateNormalLines(ps.output, 3)).join("\n");

  for (const letter of ["A", "B", "C"]) {
    expect(finalScreen).not.toContain(letter);
  }
});

it("full-height Inline paints content into every live-region row", async () => {
  const ps = term("fullscreen-no-extra-newline", ["5"]);
  await ps.waitForExit();

  expect(ps.output).toContain("Bottom line");

  expectNoMainScreenReset(ps.output);
  const lastFrame = stripAnsi(ps.output);

  // Check the frame itself uses all five rows. Post-frame teardown placement is
  // covered by inline-overflow-comparison's real xterm replay.
  // Line 1: Full-screen: top
  // Lines 2-4: empty (from flexGrow)
  // Line 5: Bottom line (should be usable)
  const lines = lastFrame.split("\n");

  expect(lines).toHaveLength(5);
  expect(lines[4]).toContain("Bottom line");
});

it("#442: a terminal-size Box paints exactly the live-region row count", async () => {
  const rows = 5;
  const ps = term("issue-442-full-height", [String(rows)]);
  await ps.waitForExit();

  expectNoMainScreenReset(ps.output);
  const lastFrameContent = stripAnsi(ps.output);
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
  expect(clearTerminalCount).toBe(0);
  expectNoMainScreenReset(output);
  expect(eraseLineCount).toBeGreaterThan(0);
});

it("#450: initial over-height tree is top-clipped without a terminal reset", async () => {
  const renderedMarker = "__INITIAL_OVERFLOW_FRAME_RENDERED__";
  const outputBeforeMarker = await runIssue450FixtureBeforeMarker(
    "issue-450-initial-overflow",
    renderedMarker,
    3,
  );

  expectNoMainScreenReset(outputBeforeMarker);
  expect(outputBeforeMarker).toContain("#450 initial overflow line 1");
  expect(outputBeforeMarker).toContain("#450 initial overflow line 3");
  expect(outputBeforeMarker).not.toContain("#450 initial overflow line 4");
});

it("#450: initial full-height frame should not clear terminal", async () => {
  const renderedMarker = "__INITIAL_FULLSCREEN_FRAME_RENDERED__";
  const outputBeforeMarker = await runIssue450FixtureBeforeMarker(
    "issue-450-initial-fullscreen",
    renderedMarker,
    3,
  );

  expectNoMainScreenReset(outputBeforeMarker);
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
  expectNoMainScreenReset(outputBeforeMarker);
});

it("#450: shrink from full-height to rows - 1 never resets the terminal", async () => {
  const { output, clearTerminalCount } = await runIssue450FixtureWithCounts(
    "issue-450-shrink-from-fullscreen-rerender",
  );

  expect(output).toContain("frame 8");
  expect(clearTerminalCount).toBe(0);
  expectNoMainScreenReset(output);
});

it("#450 control: rows - 1 rerenders should avoid clearTerminal", async () => {
  const { output, clearTerminalCount, eraseLineCount } = await runIssue450FixtureWithCounts(
    "issue-450-height-minus-one-rerender",
  );
  expect(clearTerminalCount).toBe(0);
  expectNoMainScreenReset(output);
  expect(eraseLineCount).toBeGreaterThan(0);
});

it("#450: full-height rerenders should not clear before unmount", async () => {
  const outputBeforeMarker = await runIssue450FixtureBeforeMarker(
    "issue-450-full-height-rerender-with-marker",
    "__FULL_HEIGHT_RERENDER_COMPLETED__",
  );
  const { clearTerminalCount } = getIssue450ControlSequenceCounts(outputBeforeMarker);
  expect(clearTerminalCount).toBe(0);
  expectNoMainScreenReset(outputBeforeMarker);
});

it("#450: shrink from overflow to rows - 1 never resets the terminal", async () => {
  const { output, clearTerminalCount } = await runIssue450FixtureWithCounts(
    "issue-450-shrink-from-overflow-rerender",
  );
  expect(clearTerminalCount).toBe(0);
  expectNoMainScreenReset(output);
});

it("#450: <Static> with shrink from full-height never resets the terminal", async () => {
  const { output, clearTerminalCount } = await runIssue450FixtureWithCounts(
    "issue-450-static-shrink-from-fullscreen-rerender",
  );
  expect(output).toContain("#450 static line");
  expect(clearTerminalCount).toBe(0);
  expectNoMainScreenReset(output);
});

it("#450: full-height rerenders with <Static> should not repeatedly clear terminal", async () => {
  const { output, clearTerminalCount, eraseLineCount } = await runIssue450FixtureWithCounts(
    "issue-450-full-height-with-static-rerender",
  );
  expect(output).toContain("#450 static line");
  expect(clearTerminalCount).toBe(0);
  expectNoMainScreenReset(output);
  expect(eraseLineCount).toBeGreaterThan(0);
});
