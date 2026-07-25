import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useInput } from "@vue-tui/runtime";
import { useStderr, useStdout } from "../../../runtime/dist/internal.mjs";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

function createSwitchableWritable(options: { readonly isTTY: boolean }) {
  let failure: Error | undefined;
  let throwSynchronously = false;
  const stream = new Writable({
    write(_chunk, _encoding, callback) {
      if (failure && !throwSynchronously) {
        callback(failure);
        return;
      }
      callback();
    },
  }) as unknown as NodeJS.WriteStream;
  Object.assign(stream, {
    isTTY: options.isTTY,
    columns: 80,
    rows: 24,
  });
  const originalWrite = stream.write.bind(stream);
  stream.write = ((...args: unknown[]) => {
    if (failure && throwSynchronously) throw failure;
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];
  return {
    stream,
    failWith(error: Error, sync = false) {
      failure = error;
      throwSynchronously = sync;
    },
  };
}

function createSynchronousLossWritable(options: {
  readonly isTTY: boolean;
  readonly event: "close" | "finish";
}) {
  const events = new EventEmitter();
  let loseOnNextWrite = false;
  const stream = Object.assign(events, {
    isTTY: options.isTTY,
    columns: 80,
    rows: 24,
    destroyed: false,
    writable: true,
    writableEnded: false,
    write(_chunk: string | Uint8Array, callback?: (error?: Error | null) => void): boolean {
      if (!loseOnNextWrite) {
        callback?.();
        return true;
      }
      loseOnNextWrite = false;
      if (options.event === "close") stream.destroyed = true;
      else stream.writableEnded = true;
      stream.emit(options.event);
      return false;
    },
  });
  return {
    stream: stream as unknown as NodeJS.WriteStream,
    loseOnNextWrite() {
      loseOnNextWrite = true;
    },
  };
}

test("mounted streams remain borrowed, reusable, and retain caller listeners", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const stdoutWrites = captureWrites(stdout);
  const callerStdoutError = () => {};
  const callerStderrError = () => {};
  const callerStdinEnd = () => {};
  stdout.on("error", callerStdoutError);
  stderr.on("error", callerStderrError);
  stdin.on("end", callerStdinEnd);
  const baseline = {
    stdoutError: stdout.listenerCount("error"),
    stdoutClose: stdout.listenerCount("close"),
    stderrError: stderr.listenerCount("error"),
    stdinEnd: stdin.listenerCount("end"),
    stdinClose: stdin.listenerCount("close"),
  };
  const app = createApp(defineComponent(() => () => <Text>borrowed</Text>));

  app.mount({ stdin, stdout, stderr, patchConsole: false });
  app.unmount();
  await app.waitUntilExit();

  expect(stdout.destroyed).toBe(false);
  expect(stdout.writableEnded).toBe(false);
  expect(stderr.destroyed).toBe(false);
  expect(stderr.writableEnded).toBe(false);
  expect(stdin.destroyed).toBe(false);
  expect(stdout.listenerCount("error")).toBe(baseline.stdoutError);
  expect(stdout.listenerCount("close")).toBe(baseline.stdoutClose);
  expect(stderr.listenerCount("error")).toBe(baseline.stderrError);
  expect(stdin.listenerCount("end")).toBe(baseline.stdinEnd);
  expect(stdin.listenerCount("close")).toBe(baseline.stdinClose);

  stdout.write("after-exit");
  stderr.write("after-exit");
  stdin.write("after-exit");
  expect(stdoutWrites).toContain("after-exit");

  stdout.off("error", callerStdoutError);
  stderr.off("error", callerStderrError);
  stdin.off("end", callerStdinEnd);
  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});

test("a listener-cleanup failure rejects exit without wedging other stream cleanup", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const cleanupFailure = new Error("stdout listener cleanup failed");
  const originalOff = stdout.off.bind(stdout);
  let failedOnce = false;
  stdout.off = ((event: string | symbol, listener: (...args: unknown[]) => void) => {
    const result = originalOff(event, listener);
    if (!failedOnce) {
      failedOnce = true;
      throw cleanupFailure;
    }
    return result;
  }) as typeof stdout.off;
  const baseline = {
    stderrError: stderr.listenerCount("error"),
    stdinError: stdin.listenerCount("error"),
    stdinClose: stdin.listenerCount("close"),
  };
  const app = createApp(defineComponent(() => () => <Text>cleanup</Text>));

  app.mount({ stdin, stdout, stderr, patchConsole: false });
  app.unmount();

  const outcome = await Promise.race([
    app.waitUntilExit().then(
      () => ({ status: "resolved" as const, error: undefined }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    ),
    new Promise<{ status: "timed-out"; error: undefined }>((resolve) => {
      setTimeout(() => resolve({ status: "timed-out", error: undefined }), 100);
    }),
  ]);
  expect(outcome).toEqual({ status: "rejected", error: cleanupFailure });
  expect(stderr.listenerCount("error")).toBe(baseline.stderrError);
  expect(stdin.listenerCount("error")).toBe(baseline.stdinError);
  expect(stdin.listenerCount("close")).toBe(baseline.stdinClose);

  stdout.off = originalOff as typeof stdout.off;
  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});

test("a real stdout error wins and settles through waitUntilExit", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(defineComponent(() => () => <Text>running</Text>));
  const failure = new Error("stdout failed");
  const baseline = {
    stdoutError: stdout.listenerCount("error"),
    stdoutClose: stdout.listenerCount("close"),
    stdoutFinish: stdout.listenerCount("finish"),
  };

  app.mount({ stdin, stdout, stderr, patchConsole: false });
  stdout.emit("error", failure);

  await expect(app.waitUntilExit()).rejects.toBe(failure);
  expect(stdout.destroyed).toBe(false);
  expect(stdout.writableEnded).toBe(false);
  expect(stdout.listenerCount("error")).toBe(baseline.stdoutError);
  expect(stdout.listenerCount("close")).toBe(baseline.stdoutClose);
  expect(stdout.listenerCount("finish")).toBe(baseline.stdoutFinish);
  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});

test.each([
  ["stdout close", "stdout", "close", "Runtime stdout closed while the application was active."],
  ["stdout finish", "stdout", "finish", "Runtime stdout ended while the application was active."],
  ["stderr close", "stderr", "close", "Runtime stderr closed before an accepted write completed."],
  ["stderr finish", "stderr", "finish", "Runtime stderr ended before an accepted write completed."],
] as const)(
  "%s emitted synchronously by a false-returning write cannot wedge exit",
  async (_name, target, event, message) => {
    const controlled = createSynchronousLossWritable({ isTTY: true, event });
    const stdout = target === "stdout" ? controlled.stream : makeFakeWritable();
    const stderr = target === "stderr" ? controlled.stream : makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    let write!: (data: string) => unknown;
    const Root = defineComponent(() => {
      write = target === "stdout" ? useStdout().write : useStderr().write;
      return () => <Text>ready</Text>;
    });
    const app = createApp(Root);

    app.mount({ stdin, stdout, stderr, patchConsole: false });
    await app.waitUntilRenderFlush();
    controlled.loseOnNextWrite();
    let writeFailure: unknown;
    try {
      write("lose stream");
    } catch (error) {
      writeFailure = error;
    }

    expect(writeFailure).toBeInstanceOf(Error);
    expect((writeFailure as Error).message).toBe(message);
    await expect(app.waitUntilExit()).rejects.toBe(writeFailure);
    if (stdout !== controlled.stream) stdout.destroy();
    if (stderr !== controlled.stream) stderr.destroy();
    stdin.destroy();
  },
);

test("stdout close without an Error receives a stable Runtime failure", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(defineComponent(() => () => <Text>running</Text>));

  app.mount({ stdin, stdout, stderr, patchConsole: false });
  stdout.emit("close");

  await expect(app.waitUntilExit()).rejects.toThrow(
    "Runtime stdout closed while the application was active.",
  );
  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});

test.each([
  ["stdout callback EPIPE", "stdout", false],
  ["stdout synchronous throw", "stdout", true],
  ["stderr callback failure", "stderr", false],
] as const)("%s is routed through the app lifecycle", async (_name, target, synchronous) => {
  const controlled = createSwitchableWritable({ isTTY: true });
  const stdout = target === "stdout" ? controlled.stream : makeFakeWritable();
  const stderr = target === "stderr" ? controlled.stream : makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  let write!: (data: string) => unknown;
  const Root = defineComponent(() => {
    write = target === "stdout" ? useStdout().write : useStderr().write;
    return () => <Text>ready</Text>;
  });
  const app = createApp(Root);
  const failure = Object.assign(new Error(`${target} write failed`), { code: "EPIPE" });

  app.mount({ stdin, stdout, stderr, patchConsole: false });
  await app.waitUntilRenderFlush();
  controlled.failWith(failure, synchronous);
  if (synchronous) expect(() => write("failure")).toThrow(failure);
  else write("failure");

  await expect(app.waitUntilExit()).rejects.toBe(failure);
  stdout.destroy();
  if (stderr !== stdout) stderr.destroy();
  stdin.destroy();
});

test("a final non-TTY write failure converts clean unmount into rejection", async () => {
  const controlled = createSwitchableWritable({ isTTY: false });
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(defineComponent(() => () => <Text>final</Text>));
  const failure = new Error("final write failed");

  app.mount({ stdin, stdout: controlled.stream, stderr, patchConsole: false });
  controlled.failWith(failure);
  app.unmount();

  await expect(app.waitUntilExit()).rejects.toBe(failure);
  controlled.stream.destroy();
  stderr.destroy();
  stdin.destroy();
});

test("stdin loss is fatal only while managed input is active", async () => {
  const activeStdout = makeFakeWritable();
  const activeStderr = makeFakeWritable();
  const { stream: activeStdin } = makeFakeStdin();
  const active = createApp(
    defineComponent(() => {
      useInput(() => {});
      return () => <Text>active</Text>;
    }),
  );
  active.mount({
    stdin: activeStdin,
    stdout: activeStdout,
    stderr: activeStderr,
    patchConsole: false,
  });
  activeStdin.emit("end");
  await expect(active.waitUntilExit()).rejects.toThrow(
    "Runtime stdin ended while managed input was active.",
  );

  const idleStdout = makeFakeWritable();
  const idleStderr = makeFakeWritable();
  const { stream: idleStdin } = makeFakeStdin();
  const idle = createApp(defineComponent(() => () => <Text>idle</Text>));
  idle.mount({ stdin: idleStdin, stdout: idleStdout, stderr: idleStderr, patchConsole: false });
  idleStdin.emit("end");
  await new Promise<void>((resolve) => setImmediate(resolve));
  idle.unmount();
  await expect(idle.waitUntilExit()).resolves.toBeUndefined();

  activeStdout.destroy();
  activeStderr.destroy();
  activeStdin.destroy();
  idleStdout.destroy();
  idleStderr.destroy();
  idleStdin.destroy();
});

test("managed input rechecks an stdin that ended while no input was active", async () => {
  const enabled = shallowRef(false);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const rawModeCalls: boolean[] = [];
  const handled: unknown[] = [];
  stdin.setRawMode = (mode: boolean) => {
    rawModeCalls.push(mode);
    return stdin;
  };
  const app = createApp(
    defineComponent(() => {
      useInput(() => {}, { isActive: enabled });
      return () => <Text>late input</Text>;
    }),
  );
  app.config.warnHandler = () => {};
  app.config.errorHandler = (error) => {
    handled.push(error);
  };

  try {
    app.mount({ stdin, stdout, stderr, patchConsole: false });
    stdin.destroy();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(() => {
      enabled.value = true;
    }).not.toThrow();
    const activationError = handled[0];
    expect(activationError).toBeInstanceOf(Error);
    expect((activationError as Error).message).toBe(
      "Managed input is unavailable because the mounted stdin is not a controllable TTY.\n" +
        "Read raw bytes through useStdin().stdin, or mount a controllable TTY to use vue-tui input handlers.",
    );
    expect(handled).toEqual([activationError]);
    await expect(app.waitUntilExit()).rejects.toBe(activationError);
    expect(rawModeCalls).toEqual([]);
  } finally {
    app.unmount();
    stdout.destroy();
    stderr.destroy();
    stdin.destroy();
  }
});

test("an idle stderr error is not an application failure", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const callerErrors: unknown[] = [];
  stderr.on("error", (error) => callerErrors.push(error));
  const app = createApp(defineComponent(() => () => <Text>idle stderr</Text>));
  const failure = new Error("caller-owned idle stderr failure");

  app.mount({ stdin, stdout, stderr, patchConsole: false });
  stderr.emit("error", failure);
  await new Promise<void>((resolve) => setImmediate(resolve));
  app.unmount();

  await expect(app.waitUntilExit()).resolves.toBeUndefined();
  expect(callerErrors).toEqual([failure]);
  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});
