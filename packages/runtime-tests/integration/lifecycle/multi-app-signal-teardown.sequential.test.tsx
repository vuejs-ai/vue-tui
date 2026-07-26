// Sequential: drives teardown by emitting a real process signal
// (`process.emit("SIGINT")`), which runs through signal-exit's patched
// `process.emit` and its module-singleton emitter. That emitter fires its `exit`
// handlers exactly ONCE, and it also spies `process.kill` (process-global) to
// neutralize signal-exit's re-raise so the worker survives. Both are shared
// state, so this must not race a concurrent sibling that mounts an interactive
// app and registers its own onExit handler. Grouped here per CLAUDE.md.
//
// Bug: signal-exit@4 `emit()` iterates its LIVE listener array
// (`for (const fn of this.listeners[ev])`) while the unsubscribe returned by
// `onExit()` splices that same array. Runtime's teardown unsubscribes its own
// onExit token at the very start of cleanup, so on the signal path the first
// app's handler removes itself mid-iteration, the index shifts, and the SECOND
// app's handler is skipped entirely. With two apps sharing one stdin that leaves
// the TTY in raw mode and app B's terminal modes unrestored.
//
// The old comment at that call site claimed the unsubscribe is a no-op on the
// signal path because "signal-exit has already unloaded its own listeners". That
// is true only of the PROCESS signal listeners removed by `unload()`; the
// emitter's own listener array is still live and mutable during `emit('exit')`.
import { PassThrough } from "node:stream";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineComponent } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { createApp, Text, useInput } from "@vue-tui/runtime";

const SHOW_CURSOR = "\x1b[?25h";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// One shared TTY-ish stdin, like two apps running against the same terminal.
// Reflects the last setRawMode call in `isRaw` so teardown's release is visible.
function makeSharedRawStdin(): { stream: NodeJS.ReadStream; rawMode: { current: boolean } } {
  const rawMode = { current: false };
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream, mode: boolean) {
      (this as { isRaw: boolean }).isRaw = mode;
      rawMode.current = mode;
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
    ref() {},
    unref() {},
  });
  return { stream: s, rawMode };
}

// A TTY-ish stdout whose `.fd` is a real temp-file fd, so the SYNCHRONOUS
// restore path (`fs.writeSync(stream.fd, …)`) — the one that survives
// signal-exit's immediate re-raise — is observable separately from async
// `stdout.write`. Same shape as the helper in
// composables/paste-disable-signal-exit.sequential.test.tsx.
function makeFdBackedStdout(): {
  stdout: NodeJS.WriteStream;
  readSyncBytes: () => string;
  cleanup: () => void;
} {
  const filePath = path.join(os.tmpdir(), `vue-tui-multi-${process.pid}-${Math.random()}.bin`);
  const fd = fs.openSync(filePath, "w+");
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { columns: 80, rows: 24, isTTY: true, fd });
  return {
    stdout,
    readSyncBytes: () => fs.readFileSync(filePath).toString(),
    cleanup: () => {
      fs.closeSync(fd);
      fs.rmSync(filePath, { force: true });
    },
  };
}

const InputApp = defineComponent(() => {
  useInput(() => undefined);
  return () => <Text>app</Text>;
});

test("a terminating signal tears down every mounted app, not just the first", async () => {
  const first = makeFdBackedStdout();
  const second = makeFdBackedStdout();
  const { stream: stdin, rawMode } = makeSharedRawStdin();

  const appA = createApp(InputApp);
  appA.mount({ stdout: first.stdout, stdin });
  const appB = createApp(InputApp);
  appB.mount({ stdout: second.stdout, stdin });

  // Let both apps acquire raw mode on the shared stdin.
  await wait(60);
  expect(rawMode.current, "both apps should have put the shared stdin in raw mode").toBe(true);

  // Drive the signal teardown path; neutralize the re-raise so the worker lives.
  const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
  try {
    process.emit("SIGINT", "SIGINT");
  } finally {
    killSpy.mockRestore();
  }

  const firstBytes = first.readSyncBytes();
  const secondBytes = second.readSyncBytes();
  first.cleanup();
  second.cleanup();

  // Sanity: the signal path ran at all for the first-registered app.
  expect(firstBytes, "first app must restore its terminal synchronously").toContain(SHOW_CURSOR);
  // The bug: the second app's onExit handler was skipped entirely.
  expect(secondBytes, "second app must restore its terminal synchronously").toContain(SHOW_CURSOR);
  // ...which also strands the shared TTY in raw mode.
  expect(rawMode.current, "shared stdin must be returned to cooked mode").toBe(false);
});
