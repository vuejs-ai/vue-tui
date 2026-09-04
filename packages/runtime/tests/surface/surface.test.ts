import { expect, test } from "vite-plus/test";
import { blankCell } from "../../src/frame/cell.ts";
import { Frame } from "../../src/frame/frame.ts";
import { createColorCapability } from "../../src/frame/color-profile.ts";
import { createSurface, type Surface } from "../../src/surface/surface.ts";
import type { FrameWriter } from "../../src/surface/frame-writer.ts";
import type { SurfaceHistory, SurfaceRuntime } from "../../src/surface/surface-contract.ts";
import {
  createTestTerminalBackend,
  type TestTerminalBackend,
} from "../../src/terminal/test/backend.ts";

const truecolor = createColorCapability(3);

function frame(text: string): Frame {
  const lines = text.split("\n");
  const picture = new Frame(
    Math.max(1, ...lines.map((line) => line.length)),
    Math.max(1, lines.length),
  );
  for (let row = 0; row < lines.length; row++) {
    const line = lines[row]!;
    for (let column = 0; column < line.length; column++) {
      picture.set(column, row, { ...blankCell, grapheme: line[column]! });
    }
  }
  return picture;
}

/**
 * The mode writer is the session's output gate. Attaching one here records the
 * escapes a lease issues in the order the terminal would receive them, and lets
 * a test hold a handoff back the way a captured transaction does.
 */
function createHost(): {
  readonly runtime: SurfaceRuntime;
  readonly terminal: TestTerminalBackend;
  readonly modeWrites: string[];
  readonly writes: Array<{ readonly output: "stdout" | "stderr"; readonly data: string }>;
} {
  const terminal = createTestTerminalBackend();
  const modeWrites: string[] = [];
  const writes: Array<{ output: "stdout" | "stderr"; data: string }> = [];
  terminal.attachModeWrites((data, onHandoff, onAttempt) => {
    modeWrites.push(data);
    onAttempt?.();
    onHandoff?.();
    return true;
  });
  return {
    terminal,
    modeWrites,
    writes,
    runtime: {
      stdout: "stdout",
      isStdoutTty: true,
      isStdoutWritable: true,
      viewportColumns: 80,
      viewportRows: 2,
      write(output, data, onHandoff) {
        writes.push({ output, data });
        onHandoff?.();
        return true;
      },
      writeBestEffort(output, data, _sync, onHandoff) {
        writes.push({ output, data });
        onHandoff?.();
        return true;
      },
      runCoordinatedWrite(body, finalize) {
        body();
        finalize();
      },
      runLifecycleTransaction(operation) {
        return operation();
      },
      runSynchronizedOutput(body) {
        body();
      },
      reportTerminalReleased() {},
      setSurfaceAvailable() {},
    },
  };
}

function createWriter(): { readonly frames: string[]; readonly writer: FrameWriter } {
  const frames: string[] = [];
  return {
    frames,
    writer: {
      write(frame) {
        frames.push(frame);
      },
      done() {},
      clear() {},
      reset() {},
      createRollback() {
        return () => {};
      },
    },
  };
}

function history(output = ""): { readonly history: SurfaceHistory; readonly handed: string[] } {
  const handed: string[] = [];
  return {
    handed,
    history: {
      output,
      handoff() {
        handed.push(output);
      },
    },
  };
}

test.each([
  ["inline-terminal", { history: true, live: true }],
  ["fullscreen-terminal", { history: false, live: true }],
  ["final-stream", { history: true, live: false }],
] as const)("selects the %s surface capabilities", (kind, expected) => {
  const surface: Surface = createSurface(kind, truecolor, createTestTerminalBackend());

  expect(surface.isLive).toBe(expected.live);
  expect(surface.acceptsHistory).toBe(expected.history);
});

test("each surface supplies its own layout height", () => {
  const terminal = createTestTerminalBackend();
  const inline = createSurface("inline-terminal", truecolor, terminal);
  const fullscreen = createSurface("fullscreen-terminal", truecolor, terminal);
  const document = createSurface("final-stream", truecolor, terminal);

  expect(inline.layoutHeight(2)).toEqual({ mode: "at-most", rows: 2 });
  expect(fullscreen.layoutHeight(2)).toEqual({ mode: "exact", rows: 2 });
  expect(document.layoutHeight(2)).toEqual({ mode: "at-most", rows: 2 });
});

test("Inline owns a bounded writer region and restores it around history", () => {
  const { runtime, terminal, modeWrites, writes } = createHost();
  const surface = createSurface("inline-terminal", truecolor, terminal);
  const { writer, frames } = createWriter();
  const { history: staticHistory } = history();
  surface.attachWriter(writer);

  expect(surface.present({ frame: frame("screen"), history: staticHistory }, runtime)).toBe(true);
  expect(surface.present({ frame: frame("screen"), history: staticHistory }, runtime)).toBe(false);
  surface.handoffHistory("stdout", "note", runtime);

  expect(writes.map(({ data }) => data)).toEqual(["\x1bE", "note", "\x1bE"]);
  expect(frames).toEqual(["screen\n", "screen\n"]);
  // The live region owns the hidden cursor for as long as it exists.
  expect(modeWrites).toEqual(["\x1b[?25l"]);
  expect(terminal.isModeHeld("cursor-visibility")).toBe(true);

  surface.dispose(runtime, { cleanExit: true, sync: false });
  expect(modeWrites).toEqual(["\x1b[?25l", "\x1b[?25h"]);
});

test("Fullscreen owns its terminal lease and fixed-viewport presentation", () => {
  const { runtime, terminal, modeWrites, writes } = createHost();
  const surface = createSurface("fullscreen-terminal", truecolor, terminal);
  const { writer, frames } = createWriter();
  const { history: staticHistory } = history();
  surface.attachWriter(writer);

  expect(surface.present({ frame: frame("top\nbottom"), history: staticHistory }, runtime)).toBe(
    true,
  );

  expect(surface.isInputReady).toBe(true);
  expect(terminal.isModeHeld("alternate-screen")).toBe(true);
  expect(terminal.isModeHeld("cursor-visibility")).toBe(true);
  // The viewport enters, hides the cursor, then restates the hidden cursor at
  // the head of the frame it is about to paint.
  expect(modeWrites).toEqual(["\x1b[?1049h\x1b[H", "\x1b[?25l", "\x1b[?25l"]);
  expect(writes.at(-1)?.data).toContain("\x1b[2J");
  expect(frames).toEqual([]);

  surface.dispose(runtime, { cleanExit: true, sync: true });
  expect(terminal.isModeHeld("alternate-screen")).toBe(false);
  expect(terminal.isModeHeld("cursor-visibility")).toBe(false);
  expect(terminal.writes.map(({ data }) => data)).toEqual(["\x1b[?1049l", "\x1b[?25h"]);
});

test("Fullscreen keeps post-snapshot physical acquisitions until disposal", () => {
  const { runtime, terminal } = createHost();
  const surface = createSurface("fullscreen-terminal", truecolor, terminal);
  const rollback = surface.createRollback();

  expect(surface.resume(runtime)).toBe(true);
  rollback();
  expect(terminal.isModeHeld("alternate-screen")).toBe(true);
  surface.dispose(runtime, { cleanExit: false, sync: true });

  expect(terminal.isModeHeld("alternate-screen")).toBe(false);
  expect(terminal.isModeHeld("cursor-visibility")).toBe(false);
});

test("Document hands history off immediately and writes one final clean frame", () => {
  const { runtime, terminal, writes } = createHost();
  const surface = createSurface("final-stream", truecolor, terminal);
  const { writer } = createWriter();
  const { history: staticHistory, handed } = history("past\n");
  surface.attachWriter(writer);

  expect(surface.present({ frame: frame("latest"), history: staticHistory }, runtime)).toBe(true);
  surface.dispose(runtime, { cleanExit: true, sync: false });

  expect(handed).toEqual(["past\n"]);
  expect(writes.map(({ data }) => data)).toEqual(["latest\n"]);
});

test("Fullscreen restores the screen when the writer throws on release", () => {
  const { runtime, terminal } = createHost();
  const surface = createSurface("fullscreen-terminal", truecolor, terminal);
  const { writer } = createWriter();
  surface.attachWriter({
    ...writer,
    done() {
      throw new Error("writer release failed");
    },
  });

  surface.present({ frame: frame("a"), history: history().history }, runtime);
  // One failing release must not cost the terminal its main screen or cursor,
  // and must still reach the caller as the teardown failure it is.
  expect(() => surface.dispose(runtime, { cleanExit: true, sync: false })).toThrow(
    "writer release failed",
  );
  expect(terminal.isModeHeld("alternate-screen")).toBe(false);
  expect(terminal.isModeHeld("cursor-visibility")).toBe(false);
});
