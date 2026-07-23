import { defineComponent } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { createApp, Text, useStdin } from "@vue-tui/runtime";
import type { InternalMountOptions } from "../../../runtime/dist/internal.mjs";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

const App = defineComponent(() => () => <Text>Hello</Text>);

test.sequential("a user error handler is composed with Runtime's fatal lifecycle", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const originalError = new Error("application failure");
  const seen: unknown[] = [];
  const app = createApp(App);

  app.config.errorHandler = (error) => {
    seen.push(error);
    throw new Error("user handler failure");
  };
  app.mount({
    stdout,
    stderr,
    stdin,
    patchConsole: false,
    maxFps: 0,
  } as InternalMountOptions);

  app.config.errorHandler?.(originalError, null, "test callback");

  await expect(app.waitUntilExit()).rejects.toBe(originalError);
  expect(seen).toEqual([originalError]);
});

test.sequential("waiting for a render flush before mount resolves without touching stdout", async () => {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const app = createApp(App);
    await expect(app.waitUntilRenderFlush()).resolves.toBeUndefined();
    expect(write).not.toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});

test.sequential("a clean exit preserves a genuine AggregateError from restoration", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const restoreFailure = new AggregateError(
    [new Error("raw-mode restore detail")],
    "raw-mode restore failed",
  );
  const rawModes: boolean[] = [];

  stdin.setRawMode = (mode: boolean) => {
    rawModes.push(mode);
    if (!mode) throw restoreFailure;
    return stdin;
  };

  const InteractiveApp = defineComponent(() => {
    useStdin().setRawMode(true);
    return () => <Text>Hello</Text>;
  });
  const app = createApp(InteractiveApp);
  app.mount({
    stdout,
    stderr,
    stdin,
    patchConsole: false,
    maxFps: 0,
  } as InternalMountOptions);
  await app.waitUntilRenderFlush();

  app.unmount();

  await expect(app.waitUntilExit()).rejects.toBe(restoreFailure);
  expect(rawModes).toEqual([true, false, false]);
});

test.sequential("a real mount attempt consumes the app before a later stream is read", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(App);
  app.mount({
    stdout,
    stderr,
    stdin,
    patchConsole: false,
    maxFps: 0,
  } as InternalMountOptions);

  let readSecondStdout = false;
  const second = Object.defineProperty({}, "stdout", {
    enumerable: true,
    get() {
      readSecondStdout = true;
      return makeFakeWritable();
    },
  });
  expect(() => app.mount(second)).toThrow("can only be mounted once");
  expect(readSecondStdout).toBe(false);

  app.unmount();
  await app.waitUntilExit();
});
