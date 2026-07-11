import headless from "@xterm/headless";
import ansiEscapes from "ansi-escapes";
import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

const { Terminal } = headless;
const initialColumns = 100;
const initialRows = 4;
const targetColumns = 20;
const forbiddenMainScreenResets = ["\x1b[2J", "\x1b[3J", "\x1b[H"] as const;
const oldLogicalLine = `OLD_REFLOW_FRAME_${"A".repeat(64)}`;

async function write(terminal: InstanceType<typeof Terminal>, data: string): Promise<void> {
  await new Promise<void>((resolve) => terminal.write(data, resolve));
}

function normalLogicalLines(
  terminal: InstanceType<typeof Terminal>,
): Array<{ text: string; startRow: number }> {
  const buffer = terminal.buffer.normal;
  const logical: Array<{ text: string; startRow: number }> = [];
  for (let row = 0; row < buffer.length; row++) {
    const line = buffer.getLine(row);
    const text = (line?.translateToString(true) ?? "").trimEnd();
    if (line?.isWrapped && logical.length > 0) {
      logical[logical.length - 1]!.text += text;
    } else {
      logical.push({ text, startRow: row });
    }
  }
  return logical;
}

async function runResize(presentation: "visual" | "screen-reader") {
  const ps = term("inline-resize-history", [
    String(initialRows),
    presentation,
    String(targetColumns),
  ]);
  await ps.waitForOutput((output) => output.includes("__READY__"));
  const resizeOffset = ps.output.length;

  await ps.resize(targetColumns, initialRows);
  await ps.waitForOutput((output) => output.includes("INLINE_RESIZED"));
  await ps.waitForExit();

  const terminal = new Terminal({
    cols: initialColumns,
    rows: initialRows,
    scrollback: 1000,
    allowProposedApi: true,
  });
  await write(terminal, ps.output.slice(0, resizeOffset));
  terminal.resize(targetColumns, initialRows);
  await write(terminal, ps.output.slice(resizeOffset));

  return {
    output: ps.output,
    resizeOffset,
    logicalLines: normalLogicalLines(terminal),
    scrollbackEnd: terminal.buffer.normal.baseY,
    activeBuffer: terminal.buffer.active.type,
  };
}

test("visual Inline preserves terminal history and starts a fresh bounded region after resize", async () => {
  const { output, resizeOffset, logicalLines, scrollbackEnd } = await runResize("visual");
  const resizeOutput = output.slice(resizeOffset);

  for (const reset of forbiddenMainScreenResets) expect(output).not.toContain(reset);
  const boundary = ansiEscapes.cursorDown(initialRows) + "\x1bE";
  expect(resizeOutput.split(boundary)).toHaveLength(2);
  expect(resizeOutput.slice(0, resizeOutput.indexOf(boundary) + boundary.length)).not.toContain(
    "\x1b[2K",
  );
  expect(resizeOutput).toContain("NEW_FRAME");
  expect(logicalLines.some((line) => line.text === "NEW_FRAME")).toBe(true);
  expect(logicalLines).toContainEqual({ text: "PRE_APP_HISTORY", startRow: 0 });
  const oldSnapshot = logicalLines.find((line) => line.text === oldLogicalLine);
  expect(oldSnapshot).toBeDefined();
  expect(oldSnapshot!.startRow).toBeLessThan(scrollbackEnd);
});

test("screen-reader Inline preserves terminal history when wrapping changes on resize", async () => {
  const { output, resizeOffset, logicalLines, scrollbackEnd, activeBuffer } =
    await runResize("screen-reader");
  const resizeOutput = output.slice(resizeOffset);

  for (const reset of forbiddenMainScreenResets) expect(output).not.toContain(reset);
  const boundary = ansiEscapes.cursorDown(9999) + "\x1bE";
  expect(resizeOutput.split(boundary)).toHaveLength(2);
  expect(resizeOutput.slice(0, resizeOutput.indexOf(boundary) + boundary.length)).not.toContain(
    "\x1b[2K",
  );
  expect(resizeOutput).toContain("NEW_FRAME");
  expect(logicalLines.some((line) => line.text === "NEW_FRAME")).toBe(true);
  expect(activeBuffer).toBe("normal");
  expect(output).not.toContain("\x1b[?1049h");
  expect(output).not.toContain("\x1b[?1049l");
  expect(logicalLines).toContainEqual({ text: "PRE_APP_HISTORY", startRow: 0 });
  const oldSnapshot = logicalLines.find((line) => line.text === oldLogicalLine);
  expect(oldSnapshot).toBeDefined();
  expect(oldSnapshot!.startRow).toBeLessThan(scrollbackEnd);
});
