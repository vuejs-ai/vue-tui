import ansiEscapes from "ansi-escapes";
import { PassThrough } from "node:stream";
import { defineComponent } from "vue";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { createApp, Text, useInput } from "@vue-tui/runtime";
import type { InternalMountOptions } from "../../../runtime/dist/internal.mjs";
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

test.sequential("a synchronous initial frame failure is a consumed mount failure", async () => {
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
    app.mount({
      stdout,
      stderr,
      stdin,
      patchConsole: false,
      maxFps: 0,
    } as InternalMountOptions),
  );

  expect(mountError).toBe(failure);
  await expect(exited).rejects.toBe(failure);

  const replacement = createApp(defineComponent(() => () => <Text>replacement</Text>));
  const { stream: replacementStdin } = makeFakeStdin();
  replacement.mount({
    stdout,
    stderr,
    stdin: replacementStdin,
    patchConsole: false,
    maxFps: 0,
  } as InternalMountOptions);
  replacement.unmount();
  await expect(replacement.waitUntilExit()).resolves.toBeUndefined();
});

test.sequential("a user Vue error handler cannot replace initial managed-input failure", async () => {
  const stdout = makeFakeWritable({ columns: 80, rows: 24 });
  const stderr = makeFakeWritable({ columns: 80, rows: 24 });
  const stdoutWrites = captureWrites(stdout);
  const stderrWrites = captureWrites(stderr);
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdin, { isTTY: false });
  const handlerFailure = new Error("user error handler failed");
  const handled = vi.fn(() => {
    throw handlerFailure;
  });
  const app = createApp(
    defineComponent(() => {
      useInput(() => {});
      return () => <Text>unreachable</Text>;
    }),
  );
  app.config.errorHandler = handled;
  app.config.warnHandler = () => {};
  vi.spyOn(console, "error").mockImplementation(() => {});
  const exited = app.waitUntilExit();

  const mountError = captureMountError(() =>
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "fullscreen",
      patchConsole: false,
      maxFps: 0,
    } as InternalMountOptions),
  );

  expect(mountError).toMatchObject({
    message: expect.stringContaining(
      "Managed input is unavailable because the mounted stdin is not a controllable TTY.",
    ),
  });
  expect(handled).toHaveBeenCalledWith(mountError, expect.anything(), expect.any(String));
  await expect(exited).rejects.toBe(mountError);
  expect(stdoutWrites.join("")).toBe("");
  expect(stderrWrites.join("")).toBe("");
});

test.sequential("a handled managed-input acquisition failure cannot continue to a first frame", async () => {
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
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "fullscreen",
      patchConsole: false,
      maxFps: 0,
    } as InternalMountOptions),
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
