// Sequential: same process-global constraints as
// multi-app-signal-teardown.sequential.test.tsx — signal-exit's dispatch runs
// once per process and `process.kill` is spied to neutralize the re-raise.
//
// Covers the harder shape of the same hazard: during the signal dispatch, one
// app's teardown reaches ANOTHER app's cooperative unmount through a Vue
// cleanup hook. That unmount unsubscribes its own signal-exit token while the
// dispatch is still walking the listener array, so a third app must not be
// dropped.
import { PassThrough } from "node:stream";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineComponent, onUnmounted } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { createApp, Text, useInput, type TuiApp } from "@vue-tui/runtime";

const SHOW_CURSOR = "\x1b[?25h";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

function makeFdBackedStdout(): {
  stdout: NodeJS.WriteStream;
  readSyncBytes: () => string;
  cleanup: () => void;
} {
  const filePath = path.join(os.tmpdir(), `vue-tui-cross-${process.pid}-${Math.random()}.bin`);
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

const PlainApp = defineComponent(() => {
  useInput(() => undefined);
  return () => <Text>app</Text>;
});

test("a cooperative unmount triggered during the signal dispatch does not drop a third app", async () => {
  const first = makeFdBackedStdout();
  const second = makeFdBackedStdout();
  const third = makeFdBackedStdout();
  const { stream: stdin, rawMode } = makeSharedRawStdin();

  // Resolved after mount so the hook can reach the app object.
  let victim: TuiApp | undefined;

  // The first-registered app drags another app down with it on cleanup.
  const UnmountsAnother = defineComponent(() => {
    useInput(() => undefined);
    onUnmounted(() => {
      victim?.unmount();
    });
    return () => <Text>a</Text>;
  });

  const appA = createApp(UnmountsAnother);
  appA.mount({ stdout: first.stdout, stdin });
  const appB = createApp(PlainApp);
  appB.mount({ stdout: second.stdout, stdin });
  const appC = createApp(PlainApp);
  appC.mount({ stdout: third.stdout, stdin });
  victim = appB;

  await wait(60);
  expect(rawMode.current).toBe(true);

  const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
  try {
    process.emit("SIGINT", "SIGINT");
  } finally {
    killSpy.mockRestore();
  }

  const firstBytes = first.readSyncBytes();
  const secondBytes = second.readSyncBytes();
  const thirdBytes = third.readSyncBytes();
  first.cleanup();
  second.cleanup();
  third.cleanup();

  expect(firstBytes, "app A must restore its terminal").toContain(SHOW_CURSOR);
  // B is torn down cooperatively by A's cleanup hook rather than by its own
  // handler, but it must still end up restored.
  expect(secondBytes, "app B must restore its terminal").toContain(SHOW_CURSOR);
  // C never asked to be removed; it must not be skipped by the shifted cursor.
  expect(thirdBytes, "app C must not be dropped from the dispatch").toContain(SHOW_CURSOR);
  expect(rawMode.current, "shared stdin must be returned to cooked mode").toBe(false);
});
