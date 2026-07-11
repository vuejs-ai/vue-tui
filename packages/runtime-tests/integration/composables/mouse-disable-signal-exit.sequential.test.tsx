// Sequential: drives the runtime's signal-exit teardown by emitting a real
// process signal (`process.emit("SIGINT")`). That goes through signal-exit's
// patched `process.emit`, which uses a PROCESS-GLOBAL singleton emitter that
// fires its `exit` handlers exactly ONCE per process — so this must not race a
// concurrent sibling that also mounts an interactive app and registers its own
// onExit handler. We also spy `process.kill` (process-global) to neutralize
// signal-exit's re-raise so the worker survives. Grouped here to document the
// global-state constraint, per CLAUDE.md.
//
// Bug (same failure class as cursor / alt-screen / kitty / bracketed-paste): on
// the signal-exit path signal-exit re-raises the signal IMMEDIATELY after the
// callback returns (`{alwaysLast:false}`), so a buffered ASYNC `stdout.write` of
// a terminal-restore escape can be lost before the process dies. `teardown(true)`
// already writes show-cursor / leave-alt-screen / disable-kitty SYNCHRONOUSLY
// (`fs.writeSync(fd, …)`). The SGR mouse-disable escape must disable every mouse
// tracking level (`1003`, `1002`, `1000`) plus SGR coordinates (`1006`) and must ALSO go out on the
// SYNCHRONOUS path — otherwise, when dropped, the terminal stays in mouse
// tracking mode and keeps suppressing native text selection window-wide.
import { PassThrough } from "node:stream";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineComponent } from "vue";
import { afterEach, beforeEach, describe, test, expect, vi } from "vite-plus/test";
import { createApp, Text, useMouseInput } from "@vue-tui/runtime";

const MOUSE_ON = "\x1b[?1000h\x1b[?1006h";
const MOUSE_OFF = "\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?1006l";
const SHOW_CURSOR = "\x1b[?25h";
let previousTerm: string | undefined;

beforeEach(() => {
  previousTerm = process.env["TERM"];
  process.env["TERM"] = "xterm-256color";
});

afterEach(() => {
  if (previousTerm === undefined) delete process.env["TERM"];
  else process.env["TERM"] = previousTerm;
});

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
    ref() {},
    unref() {},
  });
  return s;
}

// A TTY-ish stdout whose `.fd` is a REAL temp-file fd. This mirrors a real
// terminal — where the stream AND its numeric fd both point at the same tty —
// but lets the test SEPARATE the two write mechanisms the runtime uses on
// teardown:
//   • async  → `stdout.write(...)`        → recorded in `asyncWrites`
//   • sync   → `fs.writeSync(stream.fd,…)` → lands in the temp file
// So a restore escape that appears in the temp file came through the SYNCHRONOUS
// path (the one that survives signal-exit's immediate re-raise); one that only
// appears in `asyncWrites` is the lost-on-signal async write.
function makeFdBackedStdout(): {
  stdout: NodeJS.WriteStream;
  asyncWrites: string[];
  readSyncBytes: () => string;
  cleanup: () => void;
} {
  const filePath = path.join(os.tmpdir(), `vue-tui-sync-${process.pid}-${Date.now()}.bin`);
  const fd = fs.openSync(filePath, "w+");

  const inner = new PassThrough();
  const asyncWrites: string[] = [];
  const realWrite = inner.write.bind(inner);
  const stdout = inner as unknown as NodeJS.WriteStream;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (stdout as any).write = (data: any, ...rest: any[]) => {
    asyncWrites.push(String(data));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (realWrite as any)(String(data), ...rest);
  };
  Object.assign(stdout, { columns: 80, rows: 24, isTTY: true, fd });

  return {
    stdout,
    asyncWrites,
    readSyncBytes: () => fs.readFileSync(filePath).toString(),
    cleanup: () => {
      fs.closeSync(fd);
      fs.rmSync(filePath, { force: true });
    },
  };
}

const MouseApp = defineComponent(() => {
  useMouseInput(() => {});
  return () => <Text>mouse</Text>;
});

describe("SGR mouse disable on signal exit", () => {
  test("a signal-driven teardown writes the mouse-OFF escape SYNCHRONOUSLY (Finding A parity)", async () => {
    const { stdout, asyncWrites, readSyncBytes, cleanup } = makeFdBackedStdout();
    const stdin = makeFakeStdin();

    const app = createApp(MouseApp);
    // liveUpdates: true forces the signal-exit handler to register regardless of
    // ambient CI/TTY detection (the resolved `interactive` flag gates it).
    app.mount({ stdout, stdin, exitOnCtrlC: false, liveUpdates: true });

    // Let useMouseInput's attach enable SGR mouse tracking (writes
    // \x1b[?1000h\x1b[?1006h, async).
    await new Promise<void>((r) => setTimeout(r, 60));
    expect(asyncWrites.join("")).toContain(MOUSE_ON);

    // Drive the SIGNAL teardown path: process.emit goes through signal-exit's
    // patched emit, which runs the runtime's onExit(() => teardown(true)).
    // Neutralize the subsequent re-raise so the worker survives.
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    try {
      process.emit("SIGINT", "SIGINT");
    } finally {
      killSpy.mockRestore();
    }

    const syncBytes = readSyncBytes();
    cleanup();

    // Sanity: the sync restore path ran at all (show-cursor flushed synchronously).
    expect(syncBytes, "show-cursor must flush synchronously on signal").toContain(SHOW_CURSOR);
    // The bug: the mouse-OFF escape must ALSO go through the synchronous path,
    // not only the async stdout.write that signal-exit's re-raise can drop.
    expect(
      syncBytes,
      "all SGR mouse levels must be disabled via fs.writeSync on the signal-exit path",
    ).toContain(MOUSE_OFF);
  });

  test("the normal (non-signal) unmount still disables SGR mouse asynchronously", async () => {
    const { stdout, asyncWrites, readSyncBytes, cleanup } = makeFdBackedStdout();
    const stdin = makeFakeStdin();

    const app = createApp(MouseApp);
    app.mount({ stdout, stdin, exitOnCtrlC: false, liveUpdates: true });

    await new Promise<void>((r) => setTimeout(r, 60));
    expect(asyncWrites.join("")).toContain(MOUSE_ON);

    // Plain unmount() is the async teardown path — no behavior change here.
    app.unmount();
    await new Promise<void>((r) => setTimeout(r, 10));

    const syncBytes = readSyncBytes();
    cleanup();

    // Mouse-OFF still emitted, via the async stream.write (not the sync fd path).
    expect(asyncWrites.some((w) => w.includes(MOUSE_OFF))).toBe(true);
    expect(syncBytes).not.toContain(MOUSE_OFF);
  });
});
