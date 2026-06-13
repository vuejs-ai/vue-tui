// Sequential: mutates process-global state — process.env.COLUMNS/LINES and
// process.stdout/process.stderr columns+rows. The terminal-size package (used by
// resolveSize's fallback) reads these globals directly, so a concurrent sibling
// would perturb the result. Tests restore every mutated prop in a finally block.

import { PassThrough } from "node:stream";
import process from "node:process";
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useWindowSize } from "@vue-tui/runtime";

function makeTtyStream(columns: number): NodeJS.WriteStream {
  const s = new PassThrough() as unknown as NodeJS.WriteStream;
  // Deliberately no `rows` — forces resolveSize() into the terminal-size fallback.
  Object.assign(s, { columns, isTTY: true });
  return s;
}

function makeFakeStdin(): NodeJS.ReadStream {
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    setRawMode() {
      return s;
    },
    setEncoding() {
      return s;
    },
  });
  (s as unknown as { ref: () => void }).ref = () => {};
  (s as unknown as { unref: () => void }).unref = () => {};
  return s;
}

// Mirrors Ink terminal-resize.tsx:110-152 ("falls back to terminal-size rows
// when stdout.rows is missing"). With the mount stdout reporting columns 0 and
// no rows, resolveSize() calls terminal-size, which — after we zero out the real
// process.stdout/stderr dimensions — resolves rows from process.env.LINES.
test.sequential("useWindowSize falls back to terminal-size rows from env.LINES when stdout.rows is missing", async () => {
  const stdout = makeTtyStream(0);
  const stderr = makeTtyStream(0);
  const stdin = makeFakeStdin();

  const originalColumns = process.env.COLUMNS;
  const originalLines = process.env.LINES;
  const originalStdoutColumns = process.stdout.columns;
  const originalStdoutRows = process.stdout.rows;
  const originalStderrColumns = process.stderr.columns;
  const originalStderrRows = process.stderr.rows;

  let capturedRows = -1;
  const App = defineComponent(() => {
    const { rows } = useWindowSize();
    capturedRows = rows.value;
    return () => <Text>{String(rows.value)}</Text>;
  });

  const app = createApp(App);
  try {
    // terminal-size prefers process.stdout/stderr dimensions, then env.
    // Zero the real streams so env.COLUMNS/LINES is the winning source.
    process.env.COLUMNS = "123";
    process.env.LINES = "45";
    process.stdout.columns = 0;
    process.stdout.rows = 0;
    process.stderr.columns = 0;
    process.stderr.rows = 0;

    app.mount({ stdout, stdin, stderr, debug: true, exitOnCtrlC: false });
    await new Promise<void>((r) => setTimeout(r, 60));

    expect(capturedRows).toBe(45);
  } finally {
    app.unmount();
    // Restore env precisely: a var that was ABSENT must be DELETED, not set to
    // the string "undefined" (which would pollute later tests' CI/size detection).
    if (originalColumns === undefined) delete process.env.COLUMNS;
    else process.env.COLUMNS = originalColumns;
    if (originalLines === undefined) delete process.env.LINES;
    else process.env.LINES = originalLines;
    process.stdout.columns = originalStdoutColumns;
    process.stdout.rows = originalStdoutRows;
    process.stderr.columns = originalStderrColumns;
    process.stderr.rows = originalStderrRows;
  }
});
