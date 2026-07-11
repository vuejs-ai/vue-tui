import headless from "@xterm/headless";
import ansiEscapes from "ansi-escapes";
import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

const { Terminal } = headless;
const rows = 6;
const shorterFrameCommitted = "\x1b]0;INLINE_OVERFLOW_SHORTER_COMMITTED\x07";

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

test.fails("current full-height inline teardown preserves pre-app scrollback", async () => {
  const { lines } = await runScenario("current-full");
  expect(lines).toContain("PRE_APP_HISTORY");
});

test("the comparison fixture marks the shorter frame before teardown", async () => {
  const { output } = await runScenario("current-shrink");
  const markerIndex = output.indexOf(shorterFrameCommitted);
  expect(output.indexOf("TOP 1")).toBeLessThan(markerIndex);
  expect(markerIndex).toBeLessThan(output.indexOf("TOP 2"));
});

test.fails("current overflow-to-shorter update preserves pre-app scrollback before teardown", async () => {
  const { output } = await runScenario("current-shrink");
  const markerIndex = output.indexOf(shorterFrameCommitted);
  const lines = await emulate(output.slice(0, markerIndex));
  expect(lines).toContain("PRE_APP_HISTORY");
});

test("an application-bounded live region preserves history and replaces its visible frame", async () => {
  const { lines, output } = await runScenario("bounded");

  expect(output).not.toContain(ansiEscapes.clearTerminal);
  expect(lines).toContain("PRE_APP_HISTORY");
  expect(lines).toContain("TOP 2");
  expect(lines).not.toContain("TOP 0");
  expect(lines).not.toContain("TOP 1");
  expect(lines).not.toContain("BOTTOM 2");
});

test("append-only frames preserve history but retain duplicate snapshots", async () => {
  const { lines, output } = await runScenario("append");

  expect(output).not.toContain(ansiEscapes.clearTerminal);
  expect(lines).toContain("PRE_APP_HISTORY");
  expect(lines).toContain("TOP 0");
  expect(lines).toContain("TOP 1");
  expect(lines).toContain("TOP 2");
});

test("an application-selected bounded tail preserves history and keeps the latest state visible", async () => {
  const { lines, output } = await runScenario("bounded-tail");

  expect(output).not.toContain(ansiEscapes.clearTerminal);
  expect(lines).toContain("PRE_APP_HISTORY");
  expect(lines).not.toContain("TOP 2");
  expect(lines).toContain("BOTTOM 2");
});

test("Static commits completed lines once while a small dynamic tail remains replaceable", async () => {
  const { lines, output } = await runScenario("static-tail");

  expect(output).not.toContain(ansiEscapes.clearTerminal);
  expect(lines).toContain("PRE_APP_HISTORY");
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
  expect(lines).not.toContain("PRE_APP_HISTORY");
  expect(lines).toContain("TOP 2");
});
