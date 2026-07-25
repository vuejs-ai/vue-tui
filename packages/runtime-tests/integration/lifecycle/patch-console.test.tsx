import { defineComponent, h, inject, onScopeDispose } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useStdin } from "@vue-tui/runtime";
import { createInternalMountOptions } from "../../../runtime/dist/internal.mjs";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

// The console patch is installed before the first user setup and forwards
// content without special-casing Vue's own warning prefix.
test("a Vue warning from initial setup is fully forwarded to stderr", async () => {
  const WarnDuringSetup = defineComponent(() => {
    inject("intentionally-missing-injection");
    return () => <Text>mounted after warning</Text>;
  });

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const stderrWrites = captureWrites(stderr);
  const { stream: stdin } = makeFakeStdin();

  // Recorder stands in for the REAL console.warn: anything that reaches it
  // escaped the patch (the late-patch bug routed initial-mount warns here).
  const realWarn = console.warn;
  const escapedWarns: string[] = [];
  console.warn = (...args: unknown[]) => {
    escapedWarns.push(args.map(String).join(" "));
  };

  try {
    const app = createApp(WarnDuringSetup);
    app.mount(createInternalMountOptions({ stdout, stderr, stdin, maxFps: 0 }));
    await app.waitUntilRenderFlush();
    app.unmount();
    await app.waitUntilExit();
  } finally {
    console.warn = realWarn;
  }

  expect(escapedWarns.filter((w) => w.startsWith("[Vue warn]"))).toEqual([]);
  expect(stderrWrites.join("")).toContain("[Vue warn]");
  expect(stderrWrites.join("")).toContain('injection "intentionally-missing-injection" not found');
});

test.each([
  ["the default", undefined],
  ["explicit true", true],
] as const)(
  "patchConsole %s reports an installation failure and rolls back the consumed mount",
  async (_label, patchConsole) => {
    let setupCalls = 0;
    const rawModes: boolean[] = [];

    const App = defineComponent(() => {
      setupCalls++;
      useStdin().setRawMode(true);
      return () => <Text>must not render</Text>;
    });

    const stdout = makeFakeWritable({ columns: 80, rows: 24 });
    const stderr = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    stdin.setRawMode = (mode: boolean) => {
      rawModes.push(mode);
      return stdin;
    };
    const stdoutWrites = captureWrites(stdout);
    const stderrWrites = captureWrites(stderr);
    const listenerCountsBefore = {
      stdin: [
        stdin.listenerCount("data"),
        stdin.listenerCount("end"),
        stdin.listenerCount("error"),
        stdin.listenerCount("close"),
      ],
      stdout: [
        stdout.listenerCount("drain"),
        stdout.listenerCount("finish"),
        stdout.listenerCount("error"),
        stdout.listenerCount("close"),
      ],
      stderr: [
        stderr.listenerCount("drain"),
        stderr.listenerCount("finish"),
        stderr.listenerCount("error"),
        stderr.listenerCount("close"),
      ],
    };
    const consoleMethodsBefore = {
      assert: console.assert,
      count: console.count,
      debug: console.debug,
      log: console.log,
      warn: console.warn,
      error: console.error,
    };
    const originalErrorDescriptor = Object.getOwnPropertyDescriptor(console, "error");
    if (!originalErrorDescriptor) throw new Error("console.error must be an own property");

    const app = createApp(App);
    let mountFailure: unknown;
    try {
      Object.defineProperty(console, "error", {
        ...originalErrorDescriptor,
        writable: false,
      });
      try {
        app.mount({
          stdin,
          stdout,
          stderr,
          mode: "fullscreen",
          ...(patchConsole === undefined ? {} : { patchConsole }),
        });
      } catch (error) {
        mountFailure = error;
      }
    } finally {
      Object.defineProperty(console, "error", originalErrorDescriptor);
    }

    // Keep the broken implementation from leaking a live app while this
    // regression is red. The correct implementation has already rolled back.
    if (mountFailure === undefined) app.unmount();

    const exitOutcome = await app.waitUntilExit().then(
      () => ({ status: "resolved" as const }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
    const listenerCountsAfter = {
      stdin: [
        stdin.listenerCount("data"),
        stdin.listenerCount("end"),
        stdin.listenerCount("error"),
        stdin.listenerCount("close"),
      ],
      stdout: [
        stdout.listenerCount("drain"),
        stdout.listenerCount("finish"),
        stdout.listenerCount("error"),
        stdout.listenerCount("close"),
      ],
      stderr: [
        stderr.listenerCount("drain"),
        stderr.listenerCount("finish"),
        stderr.listenerCount("error"),
        stderr.listenerCount("close"),
      ],
    };
    const stdoutBeforeRetry = stdoutWrites.join("");
    const stderrBeforeRetry = stderrWrites.join("");

    // A failed consumed attempt must release the stdout lease so another app
    // can use the same caller-owned streams.
    const retry = createApp(defineComponent(() => () => <Text>retry</Text>));
    retry.mount({ stdin, stdout, stderr, patchConsole: false });
    retry.unmount();
    await retry.waitUntilExit();

    expect(mountFailure).toBeInstanceOf(TypeError);
    expect(exitOutcome.status).toBe("rejected");
    if (exitOutcome.status === "rejected") expect(exitOutcome.error).toBe(mountFailure);
    expect(setupCalls).toBe(0);
    expect(rawModes).toEqual([]);
    expect(stdoutBeforeRetry).toBe("");
    expect(stderrBeforeRetry).toContain(String((mountFailure as Error).message));
    expect(listenerCountsAfter).toEqual(listenerCountsBefore);
    expect(console.assert).toBe(consoleMethodsBefore.assert);
    expect(console.count).toBe(consoleMethodsBefore.count);
    expect(console.debug).toBe(consoleMethodsBefore.debug);
    expect(console.log).toBe(consoleMethodsBefore.log);
    expect(console.warn).toBe(consoleMethodsBefore.warn);
    expect(console.error).toBe(consoleMethodsBefore.error);
  },
);

test("patchConsole false leaves the process console and app streams untouched", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const stdoutWrites = captureWrites(stdout);
  const stderrWrites = captureWrites(stderr);
  const { stream: stdin } = makeFakeStdin();
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  const calls: string[] = [];
  const local = {
    log: (...args: unknown[]) => {
      calls.push(`log:${args.map(String).join(" ")}`);
    },
    warn: (...args: unknown[]) => {
      calls.push(`warn:${args.map(String).join(" ")}`);
    },
    error: (...args: unknown[]) => {
      calls.push(`error:${args.map(String).join(" ")}`);
    },
  };
  console.log = local.log;
  console.warn = local.warn;
  console.error = local.error;

  try {
    const app = createApp(defineComponent(() => () => <Text>frame</Text>));
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        patchConsole: false,
        maxFps: 0,
      }),
    );
    expect(console.log).toBe(local.log);
    expect(console.warn).toBe(local.warn);
    expect(console.error).toBe(local.error);

    console.log("native log");
    console.warn("native warn");
    console.error("native error");

    app.unmount();
    await app.waitUntilExit();
    expect(console.log).toBe(local.log);
    expect(console.warn).toBe(local.warn);
    expect(console.error).toBe(local.error);
    expect(calls).toEqual(["log:native log", "warn:native warn", "error:native error"]);
    expect(stdoutWrites.join("")).not.toContain("native log");
    expect(stderrWrites.join("")).not.toContain("native warn");
    expect(stderrWrites.join("")).not.toContain("native error");
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }
});

test("console is restored when mount throws synchronously", () => {
  // A vnode whose `type` getter throws during the renderer's patch phase
  // bypasses Vue's component error propagation, so originalMount throws
  // synchronously. With the patch installed before mount, the throw path must
  // still restore the console via the mount-catch teardown().
  const ThrowOnPatchApp = defineComponent(() => {
    return () => {
      const vnode = h("div");
      Object.defineProperty(vnode, "type", {
        get() {
          throw new Error("boom from vnode type getter");
        },
      });
      return vnode as never;
    };
  });

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();

  const logBefore = console.log;
  const warnBefore = console.warn;

  const app = createApp(ThrowOnPatchApp);
  expect(() => app.mount(createInternalMountOptions({ stdout, stderr, stdin, maxFps: 0 }))).toThrow(
    "boom from vnode type getter",
  );

  expect(console.log).toBe(logBefore);
  expect(console.warn).toBe(warnBefore);
});

test.sequential("a console record emitted while the output gate is busy is retained", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);
  const originalWrite = stdout.write.bind(stdout);
  let emittedFromInsideWrite = false;

  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    if (!emittedFromInsideWrite && chunk.includes("FRAME")) {
      emittedFromInsideWrite = true;
      console.log("CONSOLE-WHILE-BUSY");
    }
    return (originalWrite as Function)(...args);
  }) as NodeJS.WriteStream["write"];

  const App = defineComponent(() => () => <Text>FRAME</Text>);
  const app = createApp(App);
  app.mount(createInternalMountOptions({ stdout, stderr, stdin, maxFps: 0 }));
  await app.waitUntilRenderFlush();

  expect(emittedFromInsideWrite).toBe(true);
  expect(writes.join("")).toContain("CONSOLE-WHILE-BUSY");

  app.unmount();
  await app.waitUntilExit();
});

test.sequential("non-TTY console output is immediate while the dynamic document remains final", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);
  Object.assign(stdout, { isTTY: false });
  const app = createApp(defineComponent(() => () => <Text>FINAL-DOCUMENT</Text>));

  app.mount(createInternalMountOptions({ stdin, stdout, stderr, maxFps: 0 }));
  await app.waitUntilRenderFlush();
  expect(writes.join("")).not.toContain("FINAL-DOCUMENT");

  console.log("IMMEDIATE-CONSOLE");
  await app.waitUntilRenderFlush();
  expect(writes.join("")).toContain("IMMEDIATE-CONSOLE");
  expect(writes.join("")).not.toContain("FINAL-DOCUMENT");

  app.unmount();
  await app.waitUntilExit();
  expect(writes.join("")).toContain("FINAL-DOCUMENT");
});

test.sequential("unmounting one app does not remove another app's console sink", async () => {
  const stdoutA = makeFakeWritable();
  const stdoutB = makeFakeWritable();
  const stderrA = makeFakeWritable();
  const stderrB = makeFakeWritable();
  const { stream: stdinA } = makeFakeStdin();
  const { stream: stdinB } = makeFakeStdin();
  const writesB = captureWrites(stdoutB);
  const originalLog = console.log;

  const App = defineComponent(() => () => <Text>FRAME</Text>);
  const appA = createApp(App);
  const appB = createApp(App);

  appA.mount(
    createInternalMountOptions({
      stdout: stdoutA,
      stderr: stderrA,
      stdin: stdinA,
      maxFps: 0,
    }),
  );
  appB.mount(
    createInternalMountOptions({
      stdout: stdoutB,
      stderr: stderrB,
      stdin: stdinB,
      maxFps: 0,
    }),
  );
  await Promise.all([appA.waitUntilRenderFlush(), appB.waitUntilRenderFlush()]);

  appA.unmount();
  await appA.waitUntilExit();
  console.log("SECOND-APP-STILL-OWNS-CONSOLE");
  await appB.waitUntilRenderFlush();

  expect(writesB.join("")).toContain("SECOND-APP-STILL-OWNS-CONSOLE");

  appB.unmount();
  await appB.waitUntilExit();
  expect(console.log).toBe(originalLog);
});

test.sequential("the newest console owner is removed only after its Vue cleanup", async () => {
  const stdoutA = makeFakeWritable();
  const stdoutB = makeFakeWritable();
  Object.assign(stdoutA, { isTTY: false });
  Object.assign(stdoutB, { isTTY: false });
  const stderrA = makeFakeWritable();
  const stderrB = makeFakeWritable();
  Object.assign(stderrA, { isTTY: false });
  Object.assign(stderrB, { isTTY: false });
  const { stream: stdinA } = makeFakeStdin();
  const { stream: stdinB } = makeFakeStdin();
  const writesA = captureWrites(stdoutA);
  const writesB = captureWrites(stdoutB);
  const nativeMethods = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  const AppA = defineComponent(() => {
    onScopeDispose(() => {
      console.log("A-CLEANUP");
    });
    return () => <Text>A</Text>;
  });
  const AppB = defineComponent(() => {
    onScopeDispose(() => {
      console.log("B-CLEANUP");
    });
    return () => <Text>B</Text>;
  });
  const appA = createApp(AppA);
  const appB = createApp(AppB);

  appA.mount(
    createInternalMountOptions({
      stdout: stdoutA,
      stderr: stderrA,
      stdin: stdinA,
      maxFps: 0,
    }),
  );
  const patchedMethods = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  expect(patchedMethods.log).not.toBe(nativeMethods.log);

  appB.mount(
    createInternalMountOptions({
      stdout: stdoutB,
      stderr: stderrB,
      stdin: stdinB,
      maxFps: 0,
    }),
  );
  expect(console.log).toBe(patchedMethods.log);
  expect(console.warn).toBe(patchedMethods.warn);
  expect(console.error).toBe(patchedMethods.error);

  console.log("LATEST-B");
  await appB.waitUntilRenderFlush();
  expect(writesB.join("")).toContain("LATEST-B");
  expect(writesA.join("")).not.toContain("LATEST-B");

  appB.unmount();
  await appB.waitUntilExit();
  expect(writesB.join("")).toContain("B-CLEANUP");
  expect(writesA.join("")).not.toContain("B-CLEANUP");

  console.log("REVEALED-A");
  await appA.waitUntilRenderFlush();
  expect(writesA.join("")).toContain("REVEALED-A");

  appA.unmount();
  await appA.waitUntilExit();
  expect(writesA.join("")).toContain("A-CLEANUP");
  expect(console.log).toBe(nativeMethods.log);
  expect(console.warn).toBe(nativeMethods.warn);
  expect(console.error).toBe(nativeMethods.error);
});
