import { PassThrough } from "node:stream";
import ansiEscapes from "ansi-escapes";
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, useInput } from "@vue-tui/runtime";

function makeRawTrackingStdin(initialRaw = false): {
  stream: NodeJS.ReadStream & { isRaw: boolean };
  calls: boolean[];
} {
  const calls: boolean[] = [];
  const stream = new PassThrough() as unknown as NodeJS.ReadStream & { isRaw: boolean };
  Object.assign(stream, {
    isTTY: true,
    isRaw: initialRaw,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, mode: boolean) {
      calls.push(mode);
      this.isRaw = mode;
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
    ref() {},
    unref() {},
  });
  return { stream, calls };
}

test.sequential("a failing terminal restore does not prevent the remaining leases from being released", () => {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { columns: 80, rows: 24, isTTY: true });
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { columns: 80, rows: 24, isTTY: true });
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  let failKittyDisable = true;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    writes.push(chunk);
    if (failKittyDisable && chunk.includes("\x1b[<u")) {
      throw new Error("kitty restore failed");
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  const { stream: stdin, calls: rawModeCalls } = makeRawTrackingStdin();
  const App = defineComponent(() => {
    useInput(() => "continue");
    return () => null;
  });
  const app = createApp(App);

  const exitListenersBefore = new Set(process.listeners("exit"));
  app.mount({
    stdout,
    stderr,
    stdin,
    mode: "fullscreen",
    liveUpdates: true,
    kittyKeyboard: { mode: "enabled" },
    maxFps: 0,
    patchConsole: false,
  });

  let unmountError: unknown;
  try {
    app.unmount();
  } catch (error) {
    unmountError = error;
  }

  const observed = {
    unmountError,
    leftAlternateScreen: writes.some((chunk) => chunk.includes(ansiEscapes.exitAlternativeScreen)),
    rawMode: stdin.isRaw,
    rawModeCalls: [...rawModeCalls],
  };

  // Defensive cleanup keeps an intentionally hostile stream from contaminating
  // sibling tests even if a future regression interrupts teardown again.
  failKittyDisable = false;
  for (const listener of process.listeners("exit")) {
    if (!exitListenersBefore.has(listener)) process.off("exit", listener);
  }
  stdout.removeAllListeners("resize");

  expect(observed).toMatchObject({
    unmountError: undefined,
    leftAlternateScreen: true,
    rawMode: false,
    rawModeCalls: [true, false],
  });
});

test.sequential("a failed bracketed-paste release is retried by controller disposal", () => {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { columns: 80, rows: 24, isTTY: true });
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { columns: 80, rows: 24, isTTY: true });
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  let failFirstPasteDisable = true;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    writes.push(chunk);
    if (failFirstPasteDisable && chunk.includes("\x1b[?2004l")) {
      failFirstPasteDisable = false;
      throw new Error("bracketed paste restore failed");
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  const { stream: stdin, calls: rawModeCalls } = makeRawTrackingStdin();
  const App = defineComponent(() => {
    useInput(() => "continue");
    return () => null;
  });
  const app = createApp(App);
  app.mount({
    stdout,
    stderr,
    stdin,
    liveUpdates: true,
    maxFps: 0,
    patchConsole: false,
  });

  app.unmount();

  expect({
    pasteDisableAttempts: writes.filter((chunk) => chunk.includes("\x1b[?2004l")).length,
    rawMode: stdin.isRaw,
    rawModeCalls,
  }).toEqual({
    pasteDisableAttempts: 2,
    rawMode: false,
    rawModeCalls: [true, false],
  });
});
