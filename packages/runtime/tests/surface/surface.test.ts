import { expect, test } from "vite-plus/test";
import { createSurface, type Surface } from "../../src/surface/surface.ts";
import type { FrameWriter } from "../../src/surface/frame-writer.ts";
import type { SurfaceHistory, SurfaceRuntime } from "../../src/surface/surface-contract.ts";

function createRuntime(): {
  readonly runtime: SurfaceRuntime;
  readonly terminalWrites: string[];
  readonly writes: Array<{ readonly stream: NodeJS.WriteStream; readonly data: string }>;
} {
  const stdout = {} as NodeJS.WriteStream;
  const terminalWrites: string[] = [];
  const writes: Array<{ stream: NodeJS.WriteStream; data: string }> = [];
  return {
    terminalWrites,
    writes,
    runtime: {
      stdout,
      isResumeInProgress: false,
      isStdoutTty: true,
      isStdoutWritable: true,
      viewportColumns: 80,
      viewportRows: 2,
      write(stream, data, onHandoff) {
        writes.push({ stream, data });
        onHandoff?.();
        return true;
      },
      writeBestEffort(stream, data) {
        writes.push({ stream, data });
        return true;
      },
      writeTerminal(data, onAccepted, onAttempt) {
        terminalWrites.push(data);
        onAttempt?.();
        onAccepted?.();
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
      requestTerminalReconcile() {},
      reportTerminalAcquired() {},
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
      sync(frame) {
        frames.push(frame);
      },
      isCursorHidden() {
        return false;
      },
      willRender() {
        return true;
      },
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
  const surface: Surface = createSurface(kind);

  expect(surface.isLive).toBe(expected.live);
  expect(surface.acceptsHistory).toBe(expected.history);
});

test("each surface supplies its own layout and frame bounds", () => {
  const inline = createSurface("inline-terminal");
  const fullscreen = createSurface("fullscreen-terminal");
  const document = createSurface("final-stream");

  expect(inline.layoutHeight(2)).toEqual({ mode: "at-most", rows: 2 });
  expect(fullscreen.layoutHeight(2)).toEqual({ mode: "exact", rows: 2 });
  expect(document.layoutHeight(2)).toEqual({ mode: "at-most", rows: 2 });
  expect(inline.limitFrame("one\ntwo\nthree", 2)).toBe("one\ntwo");
  expect(fullscreen.limitFrame("one\ntwo\nthree", 2)).toBe("one\ntwo\nthree");
  expect(document.limitFrame("one\ntwo\nthree", 2)).toBe("one\ntwo");
});

test("Inline owns a bounded writer region and restores it around history", () => {
  const surface = createSurface("inline-terminal");
  const { runtime, writes } = createRuntime();
  const { writer, frames } = createWriter();
  const { history: staticHistory } = history();
  surface.attachWriter(writer);

  expect(surface.present({ frame: "screen", history: staticHistory }, runtime)).toBe(true);
  expect(surface.present({ frame: "screen", history: staticHistory }, runtime)).toBe(false);
  surface.handoffHistory(runtime.stdout, "note", runtime);

  expect(writes.map(({ data }) => data)).toEqual(["\x1bE", "note", "\x1bE"]);
  expect(frames).toEqual(["screen\n", "screen\n"]);
});

test("Fullscreen owns its terminal lease and fixed-viewport presentation", () => {
  const surface = createSurface("fullscreen-terminal");
  const { runtime, terminalWrites, writes } = createRuntime();
  const { writer, frames } = createWriter();
  const { history: staticHistory } = history();
  surface.attachWriter(writer);

  expect(surface.present({ frame: "top\nbottom", history: staticHistory }, runtime)).toBe(true);

  expect(surface.isInputReady).toBe(true);
  expect(terminalWrites).toEqual(["\x1b[?1049h\x1b[H", "\x1b[?25l"]);
  expect(writes.at(-1)?.data).toContain("\x1b[2J");
  expect(frames).toEqual(["top\nbottom"]);
});

test.each([
  ["alternate screen", "\x1b[?1049h\x1b[H", "\x1b[?1049l"],
  ["cursor visibility", "\x1b[?25l", "\x1b[?25h"],
] as const)(
  "Fullscreen restores %s after its lease write throws",
  (_name, failingWrite, restore) => {
    const surface = createSurface("fullscreen-terminal");
    const { runtime, terminalWrites, writes } = createRuntime();
    const { writer } = createWriter();
    surface.attachWriter(writer);
    const failingRuntime: SurfaceRuntime = {
      ...runtime,
      writeTerminal(data, onAccepted, onAttempt) {
        terminalWrites.push(data);
        onAttempt?.();
        if (data === failingWrite) throw new Error("terminal write failed after handoff");
        onAccepted?.();
        return true;
      },
    };

    expect(() =>
      surface.present({ frame: "top\nbottom", history: history().history }, failingRuntime),
    ).toThrow("terminal write failed after handoff");
    surface.abandonPendingOutput({ physicalStateUncertain: true });
    surface.dispose(failingRuntime, { cleanExit: false, sync: true });

    expect(writes.map(({ data }) => data)).toContain(restore);
  },
);

test("Document hands history off immediately and writes one final clean frame", () => {
  const surface = createSurface("final-stream");
  const { runtime, writes } = createRuntime();
  const { writer } = createWriter();
  const { history: staticHistory, handed } = history("past\n");
  surface.attachWriter(writer);

  expect(surface.present({ frame: "latest", history: staticHistory }, runtime)).toBe(true);
  surface.dispose(runtime, { cleanExit: true, sync: false });

  expect(handed).toEqual(["past\n"]);
  expect(writes.map(({ data }) => data)).toEqual(["latest\n"]);
});

test("Fullscreen retains handed leases across output rollback", () => {
  const surface = createSurface("fullscreen-terminal");
  const { runtime, writes } = createRuntime();
  const { writer } = createWriter();
  surface.attachWriter(writer);
  const terminalWrites: Array<{
    readonly accept: (() => void) | undefined;
    readonly attempt: (() => void) | undefined;
  }> = [];
  const pendingRuntime: SurfaceRuntime = {
    ...runtime,
    writeTerminal(_data, onAccepted, onAttempt) {
      terminalWrites.push({ accept: onAccepted, attempt: onAttempt });
      return true;
    },
  };

  const rollback = surface.createRollback();
  surface.present({ frame: "a", history: history().history }, pendingRuntime);
  for (const write of terminalWrites) {
    write.attempt?.();
    write.accept?.();
  }
  // OutputCoordinator reports an unhanded failure before Runtime abandons the
  // physical write. Rollback must not erase leases already handed to the TTY.
  rollback();
  surface.abandonPendingOutput({ physicalStateUncertain: true });
  surface.dispose(pendingRuntime, { cleanExit: false, sync: true });

  expect(writes.map(({ data }) => data)).toContain("\x1b[?1049l");
  expect(writes.map(({ data }) => data)).toContain("\x1b[?25h");
});

test("Fullscreen restores only the lease whose handoff started", () => {
  const surface = createSurface("fullscreen-terminal");
  const { runtime, writes } = createRuntime();
  const { writer } = createWriter();
  surface.attachWriter(writer);
  const attempts: Array<(() => void) | undefined> = [];
  const pendingRuntime: SurfaceRuntime = {
    ...runtime,
    writeTerminal(_data, _onAccepted, onAttempt) {
      attempts.push(onAttempt);
      return true;
    },
  };

  surface.present({ frame: "a", history: history().history }, pendingRuntime);
  // The alternate-screen segment started stream.write(); the captured cursor
  // segment did not. Only the former can have changed caller-owned TTY state.
  attempts[0]?.();
  surface.abandonPendingOutput({ physicalStateUncertain: true });
  surface.dispose(pendingRuntime, { cleanExit: false, sync: true });

  expect(writes.map(({ data }) => data)).toContain("\x1b[?1049l");
  expect(writes.map(({ data }) => data)).not.toContain("\x1b[?25h");
});

test("Fullscreen restores the screen when the writer throws on release", () => {
  const surface = createSurface("fullscreen-terminal");
  const { runtime, writes } = createRuntime();
  const { writer } = createWriter();
  surface.attachWriter({
    ...writer,
    done() {
      throw new Error("writer release failed");
    },
  });

  surface.present({ frame: "a", history: history().history }, runtime);
  // One failing release must not cost the terminal its main screen or cursor,
  // and must still reach the caller as the teardown failure it is.
  expect(() => surface.dispose(runtime, { cleanExit: true, sync: false })).toThrow(
    "writer release failed",
  );

  expect(writes.map(({ data }) => data)).toContain("\x1b[?1049l");
  expect(writes.map(({ data }) => data)).toContain("\x1b[?25h");
});
