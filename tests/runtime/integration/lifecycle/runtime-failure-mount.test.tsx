import ansiEscapes from "ansi-escapes";
import { defineComponent } from "vue";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { createApp, Text, useInput } from "@vue-tui/runtime";
import { createInternalMountOptions } from "../../../../packages/runtime/dist/internal.mjs";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

function captureMountError(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  return undefined;
}

test("a synchronous initial frame failure is a consumed mount failure", async () => {
  const failure = new Error("initial frame write failed");
  const stdout = makeFakeWritable({ columns: 80, rows: 24 });
  const stderr = makeFakeWritable({ columns: 80, rows: 24 });
  const { stream: stdin } = makeFakeStdin();
  const originalWrite = stdout.write.bind(stdout);
  let rejectNextWrite = true;
  stdout.write = ((...args: unknown[]) => {
    if (rejectNextWrite) {
      rejectNextWrite = false;
      throw failure;
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];
  const app = createApp(defineComponent(() => () => <Text>first frame</Text>));
  const exited = app.waitUntilExit();

  const mountError = captureMountError(() =>
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        patchConsole: false,
        maxFps: 0,
      }),
    ),
  );

  expect(mountError).toBe(failure);
  await expect(exited).rejects.toBe(failure);

  const replacement = createApp(defineComponent(() => () => <Text>replacement</Text>));
  const { stream: replacementStdin } = makeFakeStdin();
  replacement.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin: replacementStdin,
      patchConsole: false,
      maxFps: 0,
    }),
  );
  replacement.unmount();
  await expect(replacement.waitUntilExit()).resolves.toBeUndefined();
});

test("a handled managed-input acquisition failure cannot continue to a first frame", async () => {
  const failure = new Error("managed raw acquisition failed");
  const stdout = makeFakeWritable({ columns: 80, rows: 24 });
  const stderr = makeFakeWritable({ columns: 80, rows: 24 });
  const stdoutWrites = captureWrites(stdout);
  const { stream: stdin } = makeFakeStdin();
  const rawModeCalls: boolean[] = [];
  stdin.setRawMode = ((mode: boolean) => {
    rawModeCalls.push(mode);
    if (mode) throw failure;
    return stdin;
  }) as NodeJS.ReadStream["setRawMode"];
  const handled: unknown[] = [];
  const app = createApp(
    defineComponent(() => {
      useInput(() => {});
      return () => <Text>FRAME_MUST_NOT_RENDER</Text>;
    }),
  );
  app.config.warnHandler = () => {};
  app.config.errorHandler = (error) => {
    handled.push(error);
  };
  const exited = app.waitUntilExit();

  const mountError = captureMountError(() =>
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        mode: "fullscreen",
        patchConsole: false,
        maxFps: 0,
      }),
    ),
  );

  expect(mountError).toBe(failure);
  expect(handled).toEqual([failure]);
  await expect(exited).rejects.toBe(failure);
  expect(rawModeCalls).toEqual([true, false]);
  const output = stdoutWrites.join("");
  expect(output).toContain(ansiEscapes.enterAlternativeScreen);
  expect(output).toContain(ansiEscapes.exitAlternativeScreen);
  expect(output).not.toContain(ansiEscapes.clearViewport);
  expect(output).not.toContain("FRAME_MUST_NOT_RENDER");
});

test("an emitted raw-mode error fails the mount even when setRawMode returns", async () => {
  const failure = new Error("managed raw error event");
  const stdout = makeFakeWritable({ columns: 80, rows: 24 });
  const stderr = makeFakeWritable({ columns: 80, rows: 24 });
  const stdoutWrites = captureWrites(stdout);
  const { stream: stdin } = makeFakeStdin();
  const rawModeCalls: boolean[] = [];
  stdin.setRawMode = ((mode: boolean) => {
    rawModeCalls.push(mode);
    if (mode) stdin.emit("error", failure);
    return stdin;
  }) as NodeJS.ReadStream["setRawMode"];
  const app = createApp(
    defineComponent(() => {
      useInput(() => {});
      return () => <Text>FRAME_MUST_NOT_RENDER</Text>;
    }),
  );
  app.config.warnHandler = () => {};
  const exited = app.waitUntilExit();

  const mountError = captureMountError(() =>
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        mode: "fullscreen",
        patchConsole: false,
        maxFps: 0,
      }),
    ),
  );

  expect(mountError).toBe(failure);
  await expect(exited).rejects.toBe(failure);
  expect(rawModeCalls).toEqual([true, false]);
  const output = stdoutWrites.join("");
  expect(output).toContain(ansiEscapes.enterAlternativeScreen);
  expect(output).toContain(ansiEscapes.exitAlternativeScreen);
  expect(output).not.toContain("FRAME_MUST_NOT_RENDER");
});
