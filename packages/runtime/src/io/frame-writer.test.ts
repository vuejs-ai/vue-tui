import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import ansiEscapes from "ansi-escapes";
import { describe, expect, test } from "vite-plus/test";
import { createFrameWriter } from "./frame-writer.ts";
import { showCursorEscape, hideCursorEscape } from "./cursor-helpers.ts";
import logUpdate from "./log-update.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WriteSpy {
  (...args: unknown[]): boolean;
  callCount: number;
  firstCall: { args: unknown[] };
  secondCall: { args: unknown[] };
  calls: unknown[][];
}

interface FakeStdout extends NodeJS.WriteStream {
  /** Last write arg */
  get: () => string;
  write: WriteSpy;
}

function createStdout(): FakeStdout {
  const stdout = new EventEmitter() as unknown as FakeStdout;
  stdout.columns = 100;
  stdout.isTTY = true;

  const calls: unknown[][] = [];
  const writeFn = ((...args: unknown[]) => {
    calls.push(args);
    writeFn.callCount = calls.length;
    return true;
  }) as WriteSpy;

  writeFn.callCount = 0;
  writeFn.calls = calls;

  Object.defineProperty(writeFn, "firstCall", {
    get: () => ({ args: calls[0] ?? [] }),
  });
  Object.defineProperty(writeFn, "secondCall", {
    get: () => ({ args: calls[1] ?? [] }),
  });

  stdout.write = writeFn;
  stdout.get = () => calls[calls.length - 1]![0] as string;
  return stdout;
}

// ---------------------------------------------------------------------------
// Debug mode (existing test)
// ---------------------------------------------------------------------------

test("debug mode writes complete frames terminated by newline", () => {
  const writes: string[] = [];
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { columns: 80, rows: 24, isTTY: true });
  stream.on("data", (chunk) => writes.push(chunk.toString()));

  const writer = createFrameWriter(stream, { debug: true });
  writer.write("hello");
  writer.write("hello"); // identical frame skipped
  writer.write("world");

  expect(writes).toEqual(["hello\n", "world\n"]);
});

test("sync() updates the dedup baseline so a later changed frame is not dropped", () => {
  // Regression: sync() previously updated log-update's previousOutput but not
  // the frame-writer's own lastFrame. After a sync() (e.g. the clearTerminal
  // path), re-rendering the pre-sync frame was silently dropped by the stale
  // lastFrame dedup even though the terminal showed different content.
  const writes: string[] = [];
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { columns: 80, rows: 24, isTTY: true });
  stream.on("data", (chunk) => writes.push(chunk.toString()));

  const writer = createFrameWriter(stream, {});
  writer.write("A\n"); // lastFrame = "A\n"
  const countAfterA = writes.length;

  // Simulate the shouldClear path: terminal is repainted to "B" out-of-band
  // and the writer is synced to that new baseline.
  writer.sync("B\n");

  // Re-render "A": content differs from what the terminal now shows ("B"),
  // so it MUST be emitted, not skipped by a stale lastFrame === "A\n".
  writer.write("A\n");
  expect(writes.length).toBeGreaterThan(countAfterA);
  expect(writes.some((w) => w.includes("A"))).toBe(true);
});

// ---------------------------------------------------------------------------
// Standard rendering
// ---------------------------------------------------------------------------

describe("standard rendering", () => {
  test("renders and updates output", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, { showCursor: true });

    render("Hello\n");
    expect(stdout.write.callCount).toBe(1);
    expect(stdout.write.firstCall.args[0]).toBe("Hello\n");

    render("World\n");
    expect(stdout.write.callCount).toBe(2);
    expect((stdout.write.secondCall.args[0] as string).includes("World")).toBe(true);
  });

  test("skips identical output", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, { showCursor: true });

    render("Hello\n");
    render("Hello\n");

    expect(stdout.write.callCount).toBe(1);
  });

  test("positions cursor after output when cursorPosition is set", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, { showCursor: true });

    render.setCursorPosition({ x: 5, y: 1 });
    render("Line 1\nLine 2\nLine 3\n");

    const written = stdout.write.firstCall.args[0] as string;
    expect(written.includes("Line 3")).toBe(true);
    expect(
      written.endsWith(ansiEscapes.cursorUp(2) + ansiEscapes.cursorTo(5) + showCursorEscape),
    ).toBe(true);
  });

  test("hides cursor before erase when cursor was previously shown", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, { showCursor: true });

    render.setCursorPosition({ x: 0, y: 0 });
    render("Hello\n");
    render.setCursorPosition({ x: 0, y: 0 });
    render("World\n");

    const secondCall = stdout.write.secondCall.args[0] as string;
    expect(secondCall.startsWith(hideCursorEscape)).toBe(true);
    expect(
      secondCall.endsWith(ansiEscapes.cursorUp(1) + ansiEscapes.cursorTo(0) + showCursorEscape),
    ).toBe(true);
  });

  test("no cursor positioning when cursorPosition is undefined", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, { showCursor: true });

    render("Hello\n");

    const written = stdout.write.firstCall.args[0] as string;
    expect(written.includes(showCursorEscape)).toBe(false);
  });

  test("cursor position at second-to-last line emits cursorUp(1)", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, { showCursor: true });

    render.setCursorPosition({ x: 3, y: 2 });
    render("Line 1\nLine 2\nLine 3\n");

    const written = stdout.write.firstCall.args[0] as string;
    expect(
      written.endsWith(ansiEscapes.cursorUp(1) + ansiEscapes.cursorTo(3) + showCursorEscape),
    ).toBe(true);
  });

  test("clearing cursor position stops cursor positioning", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, { showCursor: true });

    render.setCursorPosition({ x: 0, y: 0 });
    render("Hello\n");

    render.setCursorPosition(undefined);
    render("World\n");

    const secondCall = stdout.write.secondCall.args[0] as string;
    expect(secondCall.includes(showCursorEscape)).toBe(false);
  });

  test("returns to bottom before erase when cursor was positioned", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, { showCursor: true });

    render.setCursorPosition({ x: 0, y: 0 });
    render("Line 1\nLine 2\nLine 3\n");

    render.setCursorPosition({ x: 5, y: 0 });
    render("Line A\nLine B\nLine C\n");

    const secondCall = stdout.write.secondCall.args[0] as string;
    expect(secondCall.startsWith(hideCursorEscape)).toBe(true);
    expect(secondCall.includes(ansiEscapes.cursorDown(3))).toBe(true);
    expect(secondCall.includes("Line A")).toBe(true);
  });

  test("sync() without cursor does not write to stream", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, { showCursor: true });

    render.sync("Line 1\nLine 2\nLine 3\n");

    expect(stdout.write.callCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Incremental rendering
// ---------------------------------------------------------------------------

describe("incremental rendering", () => {
  test("renders and updates output", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("Hello\n");
    expect(stdout.write.callCount).toBe(1);
    expect(stdout.write.firstCall.args[0]).toBe("Hello\n");

    render("World\n");
    expect(stdout.write.callCount).toBe(2);
    expect((stdout.write.secondCall.args[0] as string).includes("World")).toBe(true);
  });

  test("skips identical output", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("Hello\n");
    render("Hello\n");

    expect(stdout.write.callCount).toBe(1);
  });

  test("surgical updates", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("Line 1\nLine 2\nLine 3\n");
    render("Line 1\nUpdated\nLine 3\n");

    const secondCall = stdout.write.secondCall.args[0] as string;
    expect(secondCall.includes(ansiEscapes.cursorNextLine)).toBe(true);
    expect(secondCall.includes("Updated")).toBe(true);
    expect(secondCall.includes("Line 1")).toBe(false);
    expect(secondCall.includes("Line 3")).toBe(false);
  });

  test("same-height update rewinds cursor to top with trailing newline", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("Line 1\nLine 2\nLine 3\n");
    render("Line 1\nUpdated\nLine 3\n");

    const secondCall = stdout.write.secondCall.args[0] as string;
    expect(secondCall.startsWith(ansiEscapes.cursorUp(3))).toBe(true);
  });

  test("clears extra lines when output shrinks", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("Line 1\nLine 2\nLine 3\n");
    render("Line 1\n");

    const secondCall = stdout.write.secondCall.args[0] as string;
    expect(secondCall.includes(ansiEscapes.eraseLines(2))).toBe(true);
  });

  test("when output grows", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("Line 1\n");
    render("Line 1\nLine 2\nLine 3\n");

    const secondCall = stdout.write.secondCall.args[0] as string;
    expect(secondCall.includes(ansiEscapes.cursorNextLine)).toBe(true);
    expect(secondCall.includes("Line 2")).toBe(true);
    expect(secondCall.includes("Line 3")).toBe(true);
    expect(secondCall.includes("Line 1")).toBe(false);
  });

  test("single write call with multiple surgical updates", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\n");
    render(
      "Line 1\nUpdated 2\nLine 3\nUpdated 4\nLine 5\nUpdated 6\nLine 7\nUpdated 8\nLine 9\nUpdated 10\n",
    );

    expect(stdout.write.callCount).toBe(2);
  });

  test("shrinking output keeps screen tight", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("Line 1\nLine 2\nLine 3\n");
    render("Line 1\nLine 2\n");
    render("Line 1\n");

    const thirdCall = stdout.get();

    expect(thirdCall).toBe(
      ansiEscapes.eraseLines(2) + ansiEscapes.cursorUp(1) + ansiEscapes.cursorNextLine,
    );
  });

  test("clear() fully resets incremental state", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("Line 1\nLine 2\nLine 3\n");
    render.clear();
    render("Line 1\n");

    const afterClear = stdout.get();

    expect(afterClear).toBe(ansiEscapes.eraseLines(0) + "Line 1\n");
  });

  test("done() resets before next render", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("Line 1\nLine 2\nLine 3\n");
    render.done();
    render("Line 1\n");

    const afterDone = stdout.get();

    expect(afterDone).toBe(ansiEscapes.eraseLines(0) + "Line 1\n");
  });

  test("multiple consecutive clear() calls (should be harmless no-ops)", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("Line 1\nLine 2\nLine 3\n");
    render.clear();
    render.clear();
    render.clear();

    expect(stdout.write.callCount).toBe(4);

    render("New content\n");
    const afterClears = stdout.get();
    expect(afterClears).toBe(ansiEscapes.eraseLines(0) + "New content\n");
  });

  test("sync() followed by update (assert incremental path is used)", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render.sync("Line 1\nLine 2\nLine 3\n");
    expect(stdout.write.callCount).toBe(0);

    render("Line 1\nUpdated\nLine 3\n");
    expect(stdout.write.callCount).toBe(1);

    const firstCall = stdout.write.firstCall.args[0] as string;
    expect(firstCall.includes(ansiEscapes.cursorNextLine)).toBe(true);
    expect(firstCall.includes("Updated")).toBe(true);
    expect(firstCall.includes("Line 1")).toBe(false);
    expect(firstCall.includes("Line 3")).toBe(false);
  });

  test("positions cursor after surgical updates", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render.setCursorPosition({ x: 5, y: 1 });
    render("Line 1\nLine 2\nLine 3\n");

    const written = stdout.write.firstCall.args[0] as string;
    expect(
      written.endsWith(ansiEscapes.cursorUp(2) + ansiEscapes.cursorTo(5) + showCursorEscape),
    ).toBe(true);
  });

  test("positions cursor after update", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render.setCursorPosition({ x: 2, y: 0 });
    render("Line 1\nLine 2\nLine 3\n");
    render.setCursorPosition({ x: 2, y: 0 });
    render("Line 1\nUpdated\nLine 3\n");

    const secondCall = stdout.write.secondCall.args[0] as string;
    expect(
      secondCall.endsWith(ansiEscapes.cursorUp(3) + ansiEscapes.cursorTo(2) + showCursorEscape),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cursor positioning (both rendering modes)
// ---------------------------------------------------------------------------

const modes = [
  { name: "standard", incremental: false },
  { name: "incremental", incremental: true },
] as const;

function createRenderForMode(incremental: boolean) {
  const stdout = createStdout();
  const render = logUpdate.create(stdout, {
    showCursor: true,
    incremental,
  });
  return { stdout, render };
}

describe.each(modes)("$name mode - cursor positioning", ({ incremental }) => {
  test("clear() returns cursor to bottom before erasing", () => {
    const { stdout, render } = createRenderForMode(incremental);

    render.setCursorPosition({ x: 5, y: 0 });
    render("Line 1\nLine 2\nLine 3\n");

    render.clear();

    const clearCall = stdout.write.secondCall.args[0] as string;
    expect(clearCall.includes(hideCursorEscape)).toBe(true);
    expect(clearCall.includes(ansiEscapes.cursorDown(3))).toBe(true);
    expect(clearCall.includes(ansiEscapes.eraseLines(4))).toBe(true);
  });

  test("repositions cursor when only cursor position changes (same output)", () => {
    const { stdout, render } = createRenderForMode(incremental);

    render.setCursorPosition({ x: 2, y: 0 });
    render("Hello\n");
    expect(stdout.write.callCount).toBe(1);

    render.setCursorPosition({ x: 3, y: 0 });
    render("Hello\n");

    expect(stdout.write.callCount).toBe(2);
    const secondCall = stdout.write.secondCall.args[0] as string;
    expect(secondCall.includes(showCursorEscape)).toBe(true);
    expect(secondCall.endsWith(ansiEscapes.cursorTo(3) + showCursorEscape)).toBe(true);
  });

  test("sync() resets cursor state", () => {
    const { stdout, render } = createRenderForMode(incremental);

    render.setCursorPosition({ x: 5, y: 0 });
    render("Line 1\nLine 2\nLine 3\n");

    render.sync("Fresh output\n");

    render("Updated output\n");

    const afterSync = stdout.get();
    expect(afterSync.includes(hideCursorEscape)).toBe(false);
    expect(afterSync.includes(ansiEscapes.cursorDown(3))).toBe(false);
  });

  test("sync() writes cursor suffix when cursor is dirty", () => {
    const { stdout, render } = createRenderForMode(incremental);

    render.setCursorPosition({ x: 5, y: 1 });
    render.sync("Line 1\nLine 2\nLine 3\n");

    expect(stdout.write.callCount).toBe(1);
    const written = stdout.write.firstCall.args[0] as string;
    expect(written).toBe(ansiEscapes.cursorUp(2) + ansiEscapes.cursorTo(5) + showCursorEscape);
  });

  test("sync() with cursor sets cursorWasShown for next render", () => {
    const { stdout, render } = createRenderForMode(incremental);

    render.setCursorPosition({ x: 5, y: 1 });
    render.sync("Line 1\nLine 2\nLine 3\n");

    render("Updated\n");

    const renderCall = stdout.get();
    expect(renderCall.startsWith(hideCursorEscape)).toBe(true);
  });

  test("sync() hides cursor when previous render showed cursor", () => {
    const { stdout, render } = createRenderForMode(incremental);

    render.setCursorPosition({ x: 5, y: 1 });
    render("Line 1\nLine 2\nLine 3\n");
    expect(stdout.write.callCount).toBe(1);

    render.sync("Fresh output\n");

    expect(stdout.write.callCount).toBe(2);
    expect(stdout.write.secondCall.args[0] as string).toBe(hideCursorEscape);
  });
});

// ---------------------------------------------------------------------------
// No-trailing-newline tests (fullscreen mode)
// ---------------------------------------------------------------------------

describe("incremental rendering - no trailing newline (fullscreen)", () => {
  test("trailing to no-trailing transition", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("A\nB\n");
    render("A\nB");

    const secondCall = stdout.write.secondCall.args[0] as string;
    expect(secondCall.includes(ansiEscapes.cursorNextLine)).toBe(true);
    expect(secondCall.endsWith("\n")).toBe(false);
  });

  test("no-trailing to no-trailing update", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("A\nB");
    render("A\nC");

    const secondCall = stdout.write.secondCall.args[0] as string;
    expect(secondCall.includes(ansiEscapes.cursorNextLine)).toBe(true);
    expect(secondCall.includes("C")).toBe(true);
    expect(secondCall.endsWith("\n")).toBe(false);
  });

  test("shrink", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("A\nB");
    render("A");

    const secondCall = stdout.write.secondCall.args[0] as string;
    expect(secondCall.includes(ansiEscapes.eraseLines(1))).toBe(true);
    expect(secondCall.endsWith("\n")).toBe(false);
  });

  test("grow", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("A");
    render("A\nB\nC");

    const secondCall = stdout.write.secondCall.args[0] as string;
    expect(secondCall.includes("B")).toBe(true);
    expect(secondCall.includes("C")).toBe(true);
    expect(secondCall.endsWith("\n")).toBe(false);
  });

  test("unchanged lines do not overshoot cursor", () => {
    const stdout = createStdout();
    const render = logUpdate.create(stdout, {
      showCursor: true,
      incremental: true,
    });

    render("A\nB");
    render("A\nB"); // identical - should be skipped entirely

    expect(stdout.write.callCount).toBe(1);

    render("X\nB");

    const thirdCall = stdout.write.secondCall.args[0] as string;
    expect(thirdCall.includes("X")).toBe(true);
    const lastCursorNextLine = thirdCall.lastIndexOf(ansiEscapes.cursorNextLine);
    expect(lastCursorNextLine).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Render to empty string
// ---------------------------------------------------------------------------

test("incremental rendering - render to empty string (full clear vs early exit)", () => {
  const stdout = createStdout();
  const render = logUpdate.create(stdout, {
    showCursor: true,
    incremental: true,
  });

  render("Line 1\nLine 2\nLine 3\n");
  render("\n");

  expect(stdout.write.callCount).toBe(2);
  const secondCall = stdout.write.secondCall.args[0] as string;
  expect(secondCall).toBe(ansiEscapes.eraseLines(4) + "\n");

  // Rendering empty string again should be skipped (identical output)
  render("\n");
  expect(stdout.write.callCount).toBe(2);
});

// ---------------------------------------------------------------------------
// createFrameWriter() integration tests
//
// Unlike the logUpdate tests above (which pass showCursor: true),
// createFrameWriter does NOT set showCursor — so logUpdate will emit a
// hideCursor escape on the first render.  Assertions here use `stdout.get()`
// (last written chunk) and relative call-count deltas rather than absolute
// counts to stay independent of that detail.
// ---------------------------------------------------------------------------

describe("createFrameWriter - standard mode", () => {
  test("write renders output and skips identical frames", () => {
    const stdout = createStdout();
    const writer = createFrameWriter(stdout, {});

    writer.write("Hello\n");
    const countAfterFirst = stdout.write.callCount;
    // The last write must contain the frame content
    expect(stdout.get().includes("Hello")).toBe(true);

    // Identical frame is skipped at the wrapper level
    writer.write("Hello\n");
    expect(stdout.write.callCount).toBe(countAfterFirst);

    // Different frame is rendered
    writer.write("World\n");
    expect(stdout.write.callCount).toBeGreaterThan(countAfterFirst);
    expect(stdout.get().includes("World")).toBe(true);
  });

  test("clear() resets dedup so the same frame renders again", () => {
    const stdout = createStdout();
    const writer = createFrameWriter(stdout, {});

    writer.write("Hello\n");
    const countAfterFirst = stdout.write.callCount;

    writer.clear();
    const countAfterClear = stdout.write.callCount;
    expect(countAfterClear).toBeGreaterThanOrEqual(countAfterFirst);

    // After clear(), the same content should render again
    writer.write("Hello\n");
    expect(stdout.write.callCount).toBeGreaterThan(countAfterClear);
    expect(stdout.get().includes("Hello")).toBe(true);
  });

  test("done() persists output and resets for next render", () => {
    const stdout = createStdout();
    const writer = createFrameWriter(stdout, {});

    writer.write("Line 1\nLine 2\n");
    writer.done();
    const countAfterDone = stdout.write.callCount;

    // After done(), writing new content should work
    writer.write("New content\n");
    expect(stdout.write.callCount).toBeGreaterThan(countAfterDone);
    expect(stdout.get().includes("New content")).toBe(true);
  });
});

describe("createFrameWriter - incremental mode", () => {
  test("write renders output and updates incrementally", () => {
    const stdout = createStdout();
    const writer = createFrameWriter(stdout, { incremental: true });

    writer.write("Line 1\nLine 2\nLine 3\n");
    const countAfterFirst = stdout.write.callCount;

    writer.write("Line 1\nUpdated\nLine 3\n");
    expect(stdout.write.callCount).toBeGreaterThan(countAfterFirst);

    const lastWritten = stdout.get();
    expect(lastWritten.includes("Updated")).toBe(true);
    // Incremental: unchanged lines are not re-sent
    expect(lastWritten.includes("Line 1")).toBe(false);
    expect(lastWritten.includes("Line 3")).toBe(false);
  });

  test("write skips identical frames", () => {
    const stdout = createStdout();
    const writer = createFrameWriter(stdout, { incremental: true });

    writer.write("Hello\n");
    const countAfterFirst = stdout.write.callCount;

    writer.write("Hello\n");
    // Dedup at the wrapper level prevents even reaching logUpdate
    expect(stdout.write.callCount).toBe(countAfterFirst);
  });
});

describe("createFrameWriter - clear/done behavior", () => {
  test("clear() erases output and allows re-render of same content", () => {
    const stdout = createStdout();
    const writer = createFrameWriter(stdout, { incremental: true });

    writer.write("Line 1\nLine 2\n");
    const countAfterWrite = stdout.write.callCount;

    writer.clear();
    const countAfterClear = stdout.write.callCount;
    // clear() triggers an erase write
    expect(countAfterClear).toBeGreaterThan(countAfterWrite);

    // Same content should render again after clear()
    writer.write("Line 1\nLine 2\n");
    expect(stdout.write.callCount).toBeGreaterThan(countAfterClear);
  });

  test("done() preserves output and resets dedup state", () => {
    const stdout = createStdout();
    const writer = createFrameWriter(stdout, { incremental: true });

    writer.write("First\n");
    writer.done();
    const countAfterDone = stdout.write.callCount;

    // After done(), a new frame goes through
    writer.write("Second\n");
    expect(stdout.write.callCount).toBeGreaterThan(countAfterDone);
    expect(stdout.get().includes("Second")).toBe(true);
  });

  test("willRender returns false for identical frames", () => {
    const stdout = createStdout();
    const writer = createFrameWriter(stdout, {});

    writer.write("Hello\n");
    // willRender delegates to logUpdate; identical content returns false
    expect(writer.willRender("Hello\n")).toBe(false);
    // Different content returns true
    expect(writer.willRender("World\n")).toBe(true);
  });
});
