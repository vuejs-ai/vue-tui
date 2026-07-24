import headless from "@xterm/headless";
import ansiEscapes from "ansi-escapes";
import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

const { Terminal } = headless;
const rows = 6;
const shorterFrameCommitted = "\x1b]0;INLINE_OVERFLOW_SHORTER_COMMITTED\x07";
const forbiddenMainScreenResets = ["\x1b[2J", "\x1b[3J", "\x1b[H"] as const;

function expectNoMainScreenReset(output: string) {
  for (const reset of forbiddenMainScreenResets) expect(output).not.toContain(reset);
}

async function emulate(output: string): Promise<string[]> {
  const terminal = new Terminal({ cols: 100, rows, scrollback: 1000, allowProposedApi: true });
  await new Promise<void>((resolve) => terminal.write(output, resolve));
  const buffer = terminal.buffer.normal;

  return Array.from({ length: buffer.length }, (_, row) =>
    (buffer.getLine(row)?.translateToString(true) ?? "").trimEnd(),
  );
}

async function runScenario(scenario: string): Promise<{ lines: string[]; output: string }> {
  const ps = term("inline-overflow-comparison", [String(rows), scenario]);
  await ps.waitForExit();

  return { lines: await emulate(ps.output), output: ps.output };
}

test("full-height Inline teardown preserves pre-app scrollback", async () => {
  const { lines, output } = await runScenario("current-full");
  expectNoMainScreenReset(output);
  expect(lines).toContain("PRE_APP_HISTORY");
  expect(lines).toContain("TOP 2");
  expect(lines).toContain("BOTTOM 2");
  expect(lines).not.toContain("TOP 0");
  expect(lines).not.toContain("TOP 1");
});

test("the comparison fixture marks the shorter frame before teardown", async () => {
  const { output } = await runScenario("current-shrink");
  const markerIndex = output.indexOf(shorterFrameCommitted);
  expect(output.indexOf("TOP 1")).toBeLessThan(markerIndex);
  expect(markerIndex).toBeLessThan(output.indexOf("TOP 2"));
});

test("overflow-to-shorter Inline update preserves pre-app scrollback before teardown", async () => {
  const { output } = await runScenario("current-shrink");
  const markerIndex = output.indexOf(shorterFrameCommitted);
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  expectNoMainScreenReset(output.slice(0, markerIndex));
  const lines = await emulate(output.slice(0, markerIndex));
  expect(lines).toContain("PRE_APP_HISTORY");
});

test("an application-bounded live region preserves history and replaces its visible frame", async () => {
  const { lines, output } = await runScenario("bounded");

  expectNoMainScreenReset(output);
  expect(lines).toContain("PRE_APP_HISTORY");
  expect(lines).toContain("TOP 2");
  expect(lines).not.toContain("TOP 0");
  expect(lines).not.toContain("TOP 1");
  expect(lines).not.toContain("BOTTOM 2");
});

test("an application-selected bounded tail preserves history and keeps the latest state visible", async () => {
  const { lines, output } = await runScenario("bounded-tail");

  expectNoMainScreenReset(output);
  expect(lines).toContain("PRE_APP_HISTORY");
  expect(lines).not.toContain("TOP 2");
  expect(lines).toContain("BOTTOM 2");
});

test("Static commits completed lines once while a small dynamic tail remains replaceable", async () => {
  const { lines, output } = await runScenario("static-tail");

  expectNoMainScreenReset(output);
  expect(output).not.toContain("[Vue warn]");
  expect(lines).toContain("PRE_APP_HISTORY");
  expect(lines.filter((line) => line === "DEFERRED")).toHaveLength(1);
  expect(lines.filter((line) => line === "DONE 0")).toHaveLength(1);
  expect(lines.filter((line) => line === "DONE 1")).toHaveLength(1);
  expect(lines.filter((line) => line === "DONE 2")).toHaveLength(1);
  expect(lines).toContain("TAIL 2");
  expect(lines).not.toContain("TAIL 0");
  expect(lines).not.toContain("TAIL 1");
});

test("full-screen provides bounded repaint while restoring the untouched main-screen history", async () => {
  const { lines, output } = await runScenario("fullscreen");

  expect(output).toContain(ansiEscapes.enterAlternativeScreen);
  expect(output).toContain(ansiEscapes.exitAlternativeScreen);
  expect(lines).toContain("PRE_APP_HISTORY");
  expect(lines.some((line) => line.startsWith("TOP "))).toBe(false);
});

test("an explicit pre-mount clear can opt out before vue-tui starts coordinating output", async () => {
  const { lines, output } = await runScenario("explicit-preclear");

  expect(output.indexOf(ansiEscapes.clearTerminal)).toBeLessThan(output.indexOf("TOP 0"));
  expect(output.split(ansiEscapes.clearTerminal)).toHaveLength(2);
  expectNoMainScreenReset(output.slice(output.indexOf("TOP 0")));
  expect(lines).not.toContain("PRE_APP_HISTORY");
  expect(lines).toContain("TOP 2");
});

test("Inline never takes ownership of a partially occupied pre-mount row", async () => {
  const { lines, output } = await runScenario("partial-row");

  expectNoMainScreenReset(output);
  expect(lines).toContain("PRE_APP_PARTIAL");
  expect(lines).toContain("TOP 2");
});

test("Static can be the first managed write after a partial row", async () => {
  const { lines, output } = await runScenario("partial-row-static");

  expectNoMainScreenReset(output);
  expect(lines).toContain("PRE_APP_PARTIAL");
  expect(lines.filter((line) => line === "COMMITTED")).toHaveLength(1);
});

test("full-height Inline teardown leaves the next process output on a fresh row", async () => {
  const { lines, output } = await runScenario("post-teardown");

  expectNoMainScreenReset(output);
  expect(lines).toContain("BOTTOM 2");
  expect(lines).toContain("POST_APP");
  expect(lines).not.toContain("BOTTOM 2POST_APP");
});
