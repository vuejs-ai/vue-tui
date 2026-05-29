// G11 parity: clear+reset on terminal-width DECREASE during resize.
// These tests use interactive mode (not debug) so that writer.clear() emits
// real ANSI erase sequences to stdout. They do NOT use fake timers and are
// safe to run concurrently with other test files.

import { defineComponent, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Box, Text } from "@vue-tui/runtime";
import { makeFakeWritable, makeFakeStdin, captureWrites } from "./test-streams.ts";

// eraseLines(n) emits n repetitions of "\x1b[2K" (erase line) — the sequence
// that log-update's clear() writes to wipe the previous rendered frame before
// repainting. We treat the presence of "\x1b[2K" in the output bytes collected
// AFTER the resize event as proof that writer.clear() ran on width decrease.
const ERASE_LINE = "\x1b[2K";

async function mountInteractive(columns: number, rows: number) {
  const stdout = makeFakeWritable({ columns, rows });
  const stderr = makeFakeWritable({ columns: columns, rows });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  const App = defineComponent(() => {
    return () => <Text>hello</Text>;
  });

  const app = createApp(App);
  // interactive: true forces the resize handler even in CI where isTTY alone
  // would disable it. exitOnCtrlC: false so the app stays alive.
  app.mount({ stdout, stdin, stderr, interactive: true, exitOnCtrlC: false });

  // Flush initial render.
  await nextTick();
  await nextTick();

  return { app, stdout, writes };
}

test("width decrease triggers writer.clear() — erase sequence in output", async () => {
  const { app, stdout, writes } = await mountInteractive(100, 24);

  // Baseline: snapshot the write count so we can inspect INCREMENTAL output
  // after the resize. log-update hides the cursor on the first write
  // (\x1b[?25l) but does not erase lines — no \x1b[2K before narrowing.
  const writeCountBefore = writes.length;

  // Narrow the terminal: 100 → 60 columns. This is a width DECREASE.
  stdout.columns = 60;
  stdout.emit("resize");
  await nextTick();
  await nextTick();

  // Collect only the bytes written DURING/AFTER the resize event.
  const writesAfterResize = writes.slice(writeCountBefore).join("");

  // Must contain the erase-line sequence from writer.clear() (Ink parity G11).
  expect(writesAfterResize).toContain(ERASE_LINE);

  app.unmount();
});

test("width increase does NOT trigger extra writer.clear()", async () => {
  const { app, stdout, writes } = await mountInteractive(60, 24);

  const writeCountBefore = writes.length;

  // Widen the terminal: 60 → 100 columns. NOT a narrowing — no clear expected.
  stdout.columns = 100;
  stdout.emit("resize");
  await nextTick();
  await nextTick();

  const writesAfterResize = writes.slice(writeCountBefore).join("");

  // A width-increase resize should NOT emit the erase-line sequence
  // (the normal log-update diff path handles it without a full clear).
  expect(writesAfterResize).not.toContain(ERASE_LINE);

  app.unmount();
});

test("equal-width resize (pure height change) does NOT trigger extra writer.clear()", async () => {
  const { app, stdout, writes } = await mountInteractive(80, 24);

  const writeCountBefore = writes.length;

  // Same columns, different rows — pure height change, no narrowing.
  stdout.rows = 40;
  stdout.emit("resize");
  await nextTick();
  await nextTick();

  const writesAfterResize = writes.slice(writeCountBefore).join("");

  // Height-only resize must not trigger the width-decrease clear path.
  expect(writesAfterResize).not.toContain(ERASE_LINE);

  app.unmount();
});

// clearTerminal sequence emitted by ansiEscapes.clearTerminal (\x1b[2J\x1b[3J\x1b[H).
// shouldClearTerminalForFrame fires this when wasOverflowing (previousOutputHeight > rows)
// or when isOverflowing && hadPreviousFrame. Zeroing outputHeight on narrowing (the bug)
// makes hadPreviousFrame=false and wasOverflowing=false, suppressing the clear.
const CLEAR_TERMINAL = "\x1b[2J";

test("narrowing when previous frame overflows terminal fires clearTerminal (not just erase-lines)", async () => {
  // Use a tiny terminal (3 rows) so a 5-line frame overflows (height > rows).
  // The overflowing previous frame sets outputHeight=5; on narrowing the resize
  // handler must NOT zero it — wasOverflowing=true → clearTerminal fires.
  const stdout = makeFakeWritable({ columns: 80, rows: 3 });
  const stderr = makeFakeWritable({ columns: 80, rows: 3 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  // Render 5 lines so outputHeight (5) exceeds rows (3) → overflowing frame.
  // Box with flexDirection column stacks Text children into separate rows.
  const App = defineComponent(() => {
    return () => (
      <Box flexDirection="column">
        <Text>line one</Text>
        <Text>line two</Text>
        <Text>line three</Text>
        <Text>line four</Text>
        <Text>line five</Text>
      </Box>
    );
  });

  const app = createApp(App);
  app.mount({ stdout, stdin, stderr, interactive: true, exitOnCtrlC: false });

  // Flush initial render — this sets outputHeight = 5.
  await nextTick();
  await nextTick();

  const writeCountBefore = writes.length;

  // Narrow from 80 → 40 columns. The previous frame was overflowing (height=5 > rows=3),
  // so wasOverflowing=true → shouldClearTerminalForFrame must return true →
  // clearTerminal (\x1b[2J) must appear in the output.
  stdout.columns = 40;
  stdout.emit("resize");
  await nextTick();
  await nextTick();

  const writesAfterResize = writes.slice(writeCountBefore).join("");

  // Must contain clearTerminal (the \x1b[2J part of ansiEscapes.clearTerminal).
  // With the outputHeight=0 bug this is suppressed (hadPreviousFrame=false,
  // wasOverflowing=false); with the fix (height preserved) wasOverflowing=true fires it.
  expect(writesAfterResize).toContain(CLEAR_TERMINAL);

  app.unmount();
});
