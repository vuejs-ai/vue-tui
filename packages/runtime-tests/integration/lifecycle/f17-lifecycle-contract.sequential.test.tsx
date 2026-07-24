import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import ansiEscapes from "ansi-escapes";
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useInput } from "@vue-tui/runtime";
import { useStdout } from "../../../runtime/dist/internal.mjs";
import { bsu, esu } from "../../../runtime/dist/internal.mjs";
import { createInternalMountOptions } from "../../../runtime/dist/internal.mjs";

function makeTtyWritable(): NodeJS.WriteStream & { chunks: string[] } {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream & { chunks: string[] };
  Object.assign(stream, { columns: 80, rows: 24, isTTY: true, chunks: [] as string[] });
  stream.on("data", (chunk: Buffer) => stream.chunks.push(chunk.toString()));
  return stream;
}

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

test.sequential("a resize-listener registration failure rolls the whole mount transaction back", () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin, calls: rawModeCalls } = makeRawTrackingStdin();
  const originalOn = stdout.on.bind(stdout) as typeof stdout.on;
  stdout.on = ((event: string, ...args: unknown[]) => {
    if (event === "resize") throw new Error("resize registration failed");
    return (originalOn as (event: string, ...listenerArgs: unknown[]) => NodeJS.WriteStream)(
      event,
      ...args,
    );
  }) as typeof stdout.on;

  const app = createApp(defineComponent(() => () => null));
  let mountError: unknown;
  try {
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        mode: "fullscreen",
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
      }),
    );
  } catch (error) {
    mountError = error;
  }

  const observedBeforeCallerCleanup = {
    error: mountError instanceof Error ? mountError.message : undefined,
    leftAlternateScreen: stdout.chunks.some((chunk) =>
      chunk.includes(ansiEscapes.exitAlternativeScreen),
    ),
    rawMode: stdin.isRaw,
    rawModeCalls: [...rawModeCalls],
  };

  // Let the current implementation clean itself up after the observation. The
  // target implementation has already rolled back, so this is then a no-op.
  stdout.on = originalOn;
  app.unmount();

  expect(observedBeforeCallerCleanup).toEqual({
    error: "resize registration failed",
    leftAlternateScreen: true,
    rawMode: false,
    rawModeCalls: [],
  });
});

test.sequential("raw-mode teardown restores a pre-existing raw stdin baseline", () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin } = makeRawTrackingStdin(true);
  const app = createApp(defineComponent(() => () => null));

  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
    }),
  );
  app.unmount();

  expect(stdin.isRaw).toBe(true);
});

test.sequential("raw-mode acquisition rolls back when stdin.ref throws after taking a lease", () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin, calls: rawModeCalls } = makeRawTrackingStdin();
  let refBalance = 0;
  stdin.ref = (() => {
    refBalance++;
    throw new Error("stdin.ref failed");
  }) as NodeJS.ReadStream["ref"];
  stdin.unref = () => {
    refBalance--;
    return stdin;
  };
  const inputActive = shallowRef(false);
  const App = defineComponent(() => {
    useInput(() => undefined, { isActive: inputActive });
    return () => null;
  });
  const app = createApp(App);

  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
    }),
  );
  expect(() => {
    inputActive.value = true;
  }).toThrow("stdin.ref failed");

  expect({ isRaw: stdin.isRaw, rawModeCalls, refBalance }).toEqual({
    isRaw: false,
    rawModeCalls: [true, false],
    refBalance: 0,
  });
  app.unmount();
});

test.sequential("raw-byte ingress never installs a stream-level text decoder", () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin, calls: rawModeCalls } = makeRawTrackingStdin();
  let refBalance = 0;
  let setEncodingCalls = 0;
  stdin.ref = () => {
    refBalance++;
    return stdin;
  };
  stdin.unref = () => {
    refBalance--;
    return stdin;
  };
  stdin.setEncoding = (() => {
    setEncodingCalls++;
    throw new Error("stdin.setEncoding failed");
  }) as NodeJS.ReadStream["setEncoding"];
  const app = createApp(
    defineComponent(() => {
      useInput(() => undefined);
      return () => null;
    }),
  );

  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
    }),
  );

  expect({ isRaw: stdin.isRaw, rawModeCalls, refBalance, setEncodingCalls }).toEqual({
    isRaw: true,
    rawModeCalls: [true],
    refBalance: 1,
    setEncodingCalls: 0,
  });

  app.unmount();

  expect({ isRaw: stdin.isRaw, rawModeCalls, refBalance, setEncodingCalls }).toEqual({
    isRaw: false,
    rawModeCalls: [true, false],
    refBalance: 0,
    setEncodingCalls: 0,
  });
});

test.sequential("raw-mode teardown restores a custom stdin without ref or unref", () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin, calls: rawModeCalls } = makeRawTrackingStdin();
  Object.defineProperties(stdin, {
    ref: { configurable: true, value: undefined },
    unref: { configurable: true, value: undefined },
  });
  const app = createApp(
    defineComponent(() => {
      useInput(() => undefined);
      return () => null;
    }),
  );

  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
    }),
  );
  app.unmount();

  expect({ isRaw: stdin.isRaw, rawModeCalls }).toEqual({
    isRaw: false,
    rawModeCalls: [true, false],
  });
});

test.sequential("exit settlement and beforeExit ownership are idempotent after teardown", async () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin } = makeRawTrackingStdin();
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = ((...args: unknown[]) => {
    writes.push(String(args[0]));
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  const beforeExitListeners = new Set(process.listeners("beforeExit"));
  const app = createApp(defineComponent(() => () => <Text>final</Text>));
  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      liveUpdates: false,
      patchConsole: false,
    }),
  );

  app.unmount();
  app.unmount();
  await app.waitUntilExit();

  const addedBeforeExitListeners = process
    .listeners("beforeExit")
    .filter((listener) => !beforeExitListeners.has(listener));
  const observed = {
    writeBarriers: writes.filter((chunk) => chunk === "").length,
    addedBeforeExitListeners: addedBeforeExitListeners.length,
  };

  for (const listener of addedBeforeExitListeners) {
    process.off("beforeExit", listener);
  }

  expect(observed).toEqual({
    writeBarriers: 1,
    addedBeforeExitListeners: 0,
  });
});

test.sequential("a failed coordinated Inline write closes synchronized output and restores the frame", async () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin } = makeRawTrackingStdin();
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  let failPayload = false;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    writes.push(chunk);
    if (failPayload && chunk.includes("COORDINATED_FAILURE")) {
      throw new Error("coordinated data failed");
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  let coordinatedWrite: ((data: string) => void) | undefined;
  const App = defineComponent(() => {
    coordinatedWrite = useStdout().write;
    return () => <Text>ACTIVE_FRAME</Text>;
  });
  const app = createApp(App);
  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
    }),
  );
  await app.waitUntilRenderFlush();

  const writesBeforeFailure = writes.length;
  failPayload = true;
  let writeError: unknown;
  try {
    coordinatedWrite!("COORDINATED_FAILURE\n");
  } catch (error) {
    writeError = error;
  }
  failPayload = false;

  const failureWrites = writes.slice(writesBeforeFailure);
  const failureTransaction = failureWrites.join("");
  const beginIndex = failureTransaction.indexOf(bsu);
  const payloadIndex = failureTransaction.indexOf("COORDINATED_FAILURE");
  const restoreIndex = failureTransaction.indexOf("ACTIVE_FRAME", payloadIndex);
  const endIndex = failureTransaction.indexOf(esu, restoreIndex);
  const observed = {
    error: writeError instanceof Error ? writeError.message : undefined,
    beganBeforePayload: beginIndex >= 0 && beginIndex < payloadIndex,
    restoredFrameAfterPayload: restoreIndex > payloadIndex,
    endedAfterRestore: endIndex > restoreIndex,
  };

  app.unmount();

  expect(observed).toEqual({
    error: "coordinated data failed",
    beganBeforePayload: true,
    restoredFrameAfterPayload: true,
    endedAfterRestore: true,
  });
});

test.sequential("a failed Inline resize boundary still closes synchronized output", async () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin } = makeRawTrackingStdin();
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  let failNextResizeBoundary = false;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    writes.push(chunk);
    if (failNextResizeBoundary && chunk.includes("\x1b[?25l")) {
      failNextResizeBoundary = false;
      throw new Error("resize boundary failed");
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  const app = createApp(defineComponent(() => () => <Text>ACTIVE_FRAME</Text>));
  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
    }),
  );
  await app.waitUntilRenderFlush();

  const writesBeforeFailure = writes.length;
  stdout.columns = 60;
  failNextResizeBoundary = true;
  const exited = app.waitUntilExit();
  stdout.emit("resize");
  await expect(exited).rejects.toThrow("resize boundary failed");

  const failureWrites = writes.slice(writesBeforeFailure);
  const failureTransaction = failureWrites.join("");
  const beginIndex = failureTransaction.indexOf(bsu);
  const payloadIndex = failureTransaction.indexOf("\x1b[?25l", beginIndex);
  const esuIndex = failureTransaction.indexOf(esu, payloadIndex);
  app.unmount();

  expect({
    beganSynchronizedOutput: beginIndex >= 0 && beginIndex < payloadIndex,
    closedAfterFailure: esuIndex > payloadIndex,
  }).toEqual({
    beganSynchronizedOutput: true,
    closedAfterFailure: true,
  });
});

test.sequential("a failed ordinary Inline render still closes synchronized output", async () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin } = makeRawTrackingStdin();
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  let failNextFrame = false;
  let failedRenderAttempts = 0;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    writes.push(chunk);
    if (failNextFrame && chunk.includes("ORDINARY_RENDER_FAILURE")) {
      failNextFrame = false;
      failedRenderAttempts++;
      throw new Error("ordinary render failed");
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  const content = shallowRef("initial");
  const App = defineComponent(() => () => <Text>{content.value}</Text>);
  const app = createApp(App);
  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      liveUpdates: true,
      // Keep the update below pending so unmount's synchronous final commit drives
      // the ordinary frame writer without throwing out of Vue's global post-flush
      // queue and contaminating another test in this worker.
      maxFps: 1,
      patchConsole: false,
    }),
  );
  await app.waitUntilRenderFlush();

  content.value = "ORDINARY_RENDER_FAILURE";
  await nextTick();

  const writesBeforeFailure = writes.length;
  failNextFrame = true;
  app.unmount();
  const failureWrites = writes.slice(writesBeforeFailure);
  const failureTransaction = failureWrites.join("");
  const beginIndex = failureTransaction.indexOf(bsu);
  const payloadIndex = failureTransaction.indexOf("ORDINARY_RENDER_FAILURE", beginIndex);
  const esuIndex = failureTransaction.indexOf(esu, payloadIndex);

  expect({
    failedRenderAttempts,
    beganSynchronizedOutput: beginIndex >= 0 && beginIndex < payloadIndex,
    closedAfterFailure: esuIndex > payloadIndex,
  }).toEqual({
    failedRenderAttempts: 1,
    beganSynchronizedOutput: true,
    closedAfterFailure: true,
  });
});

test.sequential("process.exit during a commit restores Fullscreen before the process terminates", async () => {
  const fixture = fileURLToPath(
    new URL("../subprocess-fixtures/process-exit-during-commit.mjs", import.meta.url),
  );
  const child = spawn(process.execPath, [fixture], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env: { ...process.env, CI: "false", FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exit = await new Promise<{
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });

  expect(exit).toEqual({ code: 0, signal: null });
  expect(stderr).toBe("");
  const enterIndex = stdout.indexOf(ansiEscapes.enterAlternativeScreen);
  const exitIndex = stdout.indexOf(ansiEscapes.exitAlternativeScreen);
  expect(enterIndex).toBeGreaterThanOrEqual(0);
  expect(exitIndex).toBeGreaterThan(enterIndex);
  expect(stdout).not.toContain("frame");
});

test.sequential("process.exit during teardown's final commit still restores Fullscreen", async () => {
  const fixture = fileURLToPath(
    new URL("../subprocess-fixtures/process-exit-during-final-commit.mjs", import.meta.url),
  );
  const child = spawn(process.execPath, [fixture], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env: { ...process.env, CI: "false", FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exit = await new Promise<{
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });

  expect(exit).toEqual({ code: 0, signal: null });
  expect(stderr).toBe("");
  expect(stdout).toContain(ansiEscapes.enterAlternativeScreen);
  expect(stdout).toContain(ansiEscapes.exitAlternativeScreen);
});
