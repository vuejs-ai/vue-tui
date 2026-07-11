// F1.6 Inline resize ownership: a terminal dimension change can reflow or make
// old rows unreachable, so the runtime leaves the old frame as history and
// establishes a fresh bounded region without erasing the stale baseline.

import ansiEscapes from "ansi-escapes";
import { defineComponent, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Box, Text } from "@vue-tui/runtime";
import stripAnsi from "strip-ansi";
import { nextLineEscape } from "../../../runtime/src/io/cursor-helpers.ts";
import {
  makeFakeWritable,
  makeFakeStdin,
  captureWrites,
  getContentWrites,
} from "./test-streams.ts";

const ERASE_LINE = "\x1b[2K";
const FORBIDDEN_MAIN_SCREEN_RESETS = ["\x1b[2J", "\x1b[3J", "\x1b[H"] as const;

function expectFreshRegion(bytes: string, rows: number) {
  for (const reset of FORBIDDEN_MAIN_SCREEN_RESETS) expect(bytes).not.toContain(reset);
  expect(bytes).not.toContain(ERASE_LINE);
  const boundary = ansiEscapes.cursorDown(rows) + nextLineEscape;
  expect(bytes.split(boundary)).toHaveLength(2);
}

async function mountInteractive(columns: number, rows: number) {
  const stdout = makeFakeWritable({ columns, rows });
  const stderr = makeFakeWritable({ columns: columns, rows });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  const App = defineComponent(() => {
    return () => <Text>hello</Text>;
  });

  const app = createApp(App);
  // liveUpdates: true forces the resize handler even in CI where isTTY alone
  // would disable it. exitOnCtrlC: false so the app stays alive.
  app.mount({ stdout, stdin, stderr, liveUpdates: true, exitOnCtrlC: false });

  // Flush initial render.
  await nextTick();
  await nextTick();

  return { app, stdout, writes };
}

test("width decrease commits the old snapshot and establishes one fresh region", async () => {
  const { app, stdout, writes } = await mountInteractive(100, 24);

  const writeCountBefore = writes.length;

  // Narrow the terminal: 100 → 60 columns. This is a width DECREASE.
  stdout.columns = 60;
  stdout.emit("resize");
  await nextTick();
  await nextTick();

  // Collect only the bytes written DURING/AFTER the resize event.
  const writesAfterResize = writes.slice(writeCountBefore).join("");

  expectFreshRegion(writesAfterResize, 24);
  expect(writesAfterResize).toContain("hello");

  app.unmount();
});

test("width increase also commits the old snapshot and establishes a fresh region", async () => {
  const { app, stdout, writes } = await mountInteractive(60, 24);

  const writeCountBefore = writes.length;

  // Widen the terminal: 60 → 100 columns. NOT a narrowing — no clear expected.
  stdout.columns = 100;
  stdout.emit("resize");
  await nextTick();
  await nextTick();

  const writesAfterResize = writes.slice(writeCountBefore).join("");

  expectFreshRegion(writesAfterResize, 24);
  expect(writesAfterResize).toContain("hello");

  app.unmount();
});

test("pure height change commits the old snapshot and uses the new bottom row", async () => {
  const { app, stdout, writes } = await mountInteractive(80, 24);

  const writeCountBefore = writes.length;

  // Same columns, different rows — pure height change, no narrowing.
  stdout.rows = 40;
  stdout.emit("resize");
  await nextTick();
  await nextTick();

  const writesAfterResize = writes.slice(writeCountBefore).join("");

  expectFreshRegion(writesAfterResize, 40);
  expect(writesAfterResize).toContain("hello");

  app.unmount();
});

test("narrowing a tall Inline frame never clears terminal history", async () => {
  // Use a tiny terminal (3 rows) so the five-line component must be bounded.
  const stdout = makeFakeWritable({ columns: 80, rows: 3 });
  const stderr = makeFakeWritable({ columns: 80, rows: 3 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

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
  app.mount({ stdout, stdin, stderr, liveUpdates: true, exitOnCtrlC: false });

  // Flush initial render.
  await nextTick();
  await nextTick();

  const writeCountBefore = writes.length;

  // Narrow from 80 → 40 columns. Reflow may erase the owned rows, but it must
  // not emit a whole-terminal clear.
  stdout.columns = 40;
  stdout.emit("resize");
  await nextTick();
  await nextTick();

  const writesAfterResize = writes.slice(writeCountBefore).join("");

  expectFreshRegion(writesAfterResize, 3);

  app.unmount();
});

// Port of Ink render.tsx:814-847 ("rerender on resize"): a resize doesn't just
// erase the old frame — it REFLOWS the content to the new width. A round-border
// <Box> wrapping "Test" renders its top/bottom rule to fill the inner width, so
// the exact bytes of the first content write must be the box padded to width-10,
// and the LAST content write after narrowing to 8 must be the box re-padded to
// width-8. (Ink asserts boxen('Test'.padEnd(8)) then boxen('Test'.padEnd(6)).)
test("resize reflows content — first frame is width-10 box, last is re-padded to width-8", async () => {
  const stdout = makeFakeWritable({ columns: 10, rows: 100 });
  const stderr = makeFakeWritable({ columns: 10, rows: 100 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  const App = defineComponent(() => () => (
    <Box borderStyle="round">
      <Text>Test</Text>
    </Box>
  ));

  const app = createApp(App);
  app.mount({ stdout, stdin, stderr, liveUpdates: true, exitOnCtrlC: false });
  await nextTick();
  await nextTick();

  // First content write: round-border box whose inner content row is "Test"
  // padded to the 8-cell inner width (columns 10 minus the 2 border columns),
  // matching Ink's boxen('Test'.padEnd(8), {borderStyle: 'round'}) + '\n'.
  const contentWrites = getContentWrites(writes);
  const width10Box = "╭────────╮\n│Test    │\n╰────────╯\n";
  expect(stripAnsi(contentWrites.find((write) => write.includes("Test"))!)).toBe(width10Box);

  // Narrow 10 → 8 columns. The frame must reflow: inner width drops to 6.
  const writeCountBeforeResize = writes.length;
  stdout.columns = 8;
  stdout.emit("resize");
  await nextTick();
  await nextTick();

  // Last content write after resize: the SAME box re-padded to the new width
  // (Ink's boxen('Test'.padEnd(6), {borderStyle: 'round'}) + '\n').
  const width8Box = "╭──────╮\n│Test  │\n╰──────╯\n";
  const contentWritesAfter = getContentWrites(writes);
  expect(stripAnsi(contentWritesAfter.at(-1)!)).toBe(width8Box);
  const resizeBytes = writes.slice(writeCountBeforeResize).join("");
  expectFreshRegion(resizeBytes, 100);

  app.unmount();
});

// Each accepted geometry becomes the next baseline, so consecutive changes
// must each abandon exactly the snapshot painted against the previous size.
test("consecutive dimension changes each establish exactly one fresh region", async () => {
  const { app, stdout, writes } = await mountInteractive(100, 24);

  // First narrowing: 100 → 80.
  let before = writes.length;
  stdout.columns = 80;
  stdout.emit("resize");
  await nextTick();
  await nextTick();
  expectFreshRegion(writes.slice(before).join(""), 24);

  // Second narrowing: 80 → 60.
  before = writes.length;
  stdout.columns = 60;
  stdout.emit("resize");
  await nextTick();
  await nextTick();
  expectFreshRegion(writes.slice(before).join(""), 24);

  app.unmount();
});

test("screen-reader resize uses a physical-bottom clamp when terminal rows are unknown", async () => {
  const stdout = makeFakeWritable({ columns: 80, rows: 80 });
  delete (stdout as { rows?: number }).rows;
  const stderr = makeFakeWritable({ columns: 80, rows: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);
  const app = createApp(() => <Text>transcript</Text>);

  app.mount({
    stdout,
    stdin,
    stderr,
    liveUpdates: true,
    isScreenReaderEnabled: true,
    exitOnCtrlC: false,
    maxFps: 0,
  });
  await nextTick();
  const beforeResize = writes.length;

  stdout.emit("resize");
  await nextTick();

  const resizeOutput = writes.slice(beforeResize).join("");
  expect(resizeOutput).toContain(ansiEscapes.cursorDown(9999) + nextLineEscape);
  for (const reset of FORBIDDEN_MAIN_SCREEN_RESETS) expect(resizeOutput).not.toContain(reset);
  expect(resizeOutput).not.toContain(ERASE_LINE);

  app.unmount();
});
