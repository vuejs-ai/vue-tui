import { Writable } from "node:stream";
import { defineComponent, onMounted, onScopeDispose } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { createApp, Text, useAppContext } from "@vue-tui/runtime";
import { makeFakeWritable, makeFakeStdin, isWriteBarrierChunk } from "./test-streams.ts";

test("useAppContext() triggers teardown and waitUntilExit resolves", async () => {
  let exitFn!: () => void;
  let disposed = false;

  const App = defineComponent(() => {
    const { exit } = useAppContext();
    exitFn = exit;
    onScopeDispose(() => {
      disposed = true;
    });
    return () => <Text>running</Text>;
  });

  const { lastFrame, waitUntilExit } = await render(App);
  expect(lastFrame()).toContain("running");

  exitFn();
  await waitUntilExit();
  expect(disposed).toBe(true);
});

test("exit(error) rejects waitUntilExit with the error", async () => {
  let exitFn!: (err: Error) => void;

  const App = defineComponent(() => {
    const { exit } = useAppContext();
    exitFn = exit;
    return () => <Text>x</Text>;
  });

  const { waitUntilExit } = await render(App);

  const boom = new Error("boom");
  exitFn(boom);
  await expect(waitUntilExit()).rejects.toBe(boom);
});

test("unmount() resolves waitUntilExit", async () => {
  const App = defineComponent(() => {
    return () => <Text>x</Text>;
  });

  const { unmount, waitUntilExit } = await render(App);
  unmount();
  await waitUntilExit();
});

test("unmount() after exit() is idempotent", async () => {
  let exitFn!: () => void;

  const App = defineComponent(() => {
    const { exit } = useAppContext();
    exitFn = exit;
    return () => <Text>x</Text>;
  });

  const { unmount, waitUntilExit } = await render(App);
  exitFn();
  await waitUntilExit();

  expect(() => unmount()).not.toThrow();
});

test("exit() called multiple times is idempotent", async () => {
  // Mirrors Ink's "exit normally without unmount() or exit()" pattern:
  // verifies that calling exit() twice does not throw or reject again.
  let exitFn!: () => void;

  const App = defineComponent(() => {
    exitFn = useAppContext().exit;
    return () => <Text>x</Text>;
  });

  const { waitUntilExit } = await render(App);
  exitFn();
  exitFn(); // second call — must not throw or create a new promise
  await waitUntilExit();
});

test("waitUntilExit() resolves with result value passed to exit()", async () => {
  // Mirrors Ink's "exit on exit() with result value"
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useAppContext().exit;
    return () => <Text>hello from vue-tui</Text>;
  });

  const { lastFrame, waitUntilExit } = await render(App);
  expect(lastFrame()).toContain("hello from vue-tui");

  exitFn("hello from ink");
  await expect(waitUntilExit()).resolves.toBe("hello from ink");
});

test("waitUntilExit() resolves with object result value", async () => {
  // Mirrors Ink's "exit on exit() with object result"
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useAppContext().exit;
    return () => <Text>hello</Text>;
  });

  const { waitUntilExit } = await render(App);
  const resultObj = { message: "hello from ink object" };
  exitFn(resultObj);
  await expect(waitUntilExit()).resolves.toBe(resultObj);
});

test("waitUntilExit() resolves with undefined when exit() called with no args", async () => {
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useAppContext().exit;
    return () => <Text>hello</Text>;
  });

  const { waitUntilExit } = await render(App);
  exitFn();
  await expect(waitUntilExit()).resolves.toBeUndefined();
});

test("onScopeDispose fires when exit(error) is called", async () => {
  // Mirrors Ink's "exit with thrown error" fixture — verifies teardown hooks
  // still run even when the exit is error-driven.
  let exitFn!: (err?: Error) => void;
  let disposed = false;

  const App = defineComponent(() => {
    exitFn = useAppContext().exit;
    onScopeDispose(() => {
      disposed = true;
    });
    return () => <Text>running</Text>;
  });

  const { waitUntilExit } = await render(App);
  exitFn(new Error("errored"));
  await waitUntilExit().catch(() => {});
  expect(disposed).toBe(true);
});

test("exit(error) followed by exit(value) still rejects", async () => {
  // Edge case: when exit is called with an error first, a subsequent exit()
  // call with a plain value should not override the rejection. The error
  // should take precedence because the FIRST exit() call wins (Ink parity G33,
  // isUnmounted||isUnmounting guard).
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useAppContext().exit;
    return () => <Text>hello</Text>;
  });

  const { waitUntilExit } = await render(App);

  const boom = new Error("first-error");
  exitFn(boom);
  exitFn("second-value");

  await expect(waitUntilExit()).rejects.toThrow("first-error");
});

test("exit(value) resolves with the FIRST value when called rapidly twice", async () => {
  // First-call-wins (Ink parity G33): the FIRST exit() captures the value and
  // initiates teardown; the second is a no-op. waitUntilExit resolves "first".
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useAppContext().exit;
    return () => <Text>hello</Text>;
  });

  const { waitUntilExit } = await render(App);

  exitFn("first");
  exitFn("second");

  const result = await waitUntilExit();
  expect(result).toBe("first");
});

test("exit(err1) then exit(err2) rejects with the FIRST error", async () => {
  // First-call-wins for errors (Ink parity G33): the first error is captured
  // and the second exit() is a no-op, so waitUntilExit rejects with err1.
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useAppContext().exit;
    return () => <Text>hello</Text>;
  });

  const { waitUntilExit } = await render(App);

  const err1 = new Error("err1");
  const err2 = new Error("err2");
  exitFn(err1);
  exitFn(err2);

  await expect(waitUntilExit()).rejects.toBe(err1);
});

test("exit(value) then exit(error) resolves with the FIRST value", async () => {
  // value→error ordering (Ink parity G33): the FIRST exit() captures the value
  // and initiates teardown; the later exit(error) is a complete no-op, so
  // waitUntilExit RESOLVES with the original value rather than rejecting.
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useAppContext().exit;
    return () => <Text>hello</Text>;
  });

  const { waitUntilExit } = await render(App);

  exitFn("x");
  exitFn(new Error("e"));

  await expect(waitUntilExit()).resolves.toBe("x");
});

test("exit('late') after app.unmount() is a no-op (unmount value wins)", async () => {
  // isUnmounting parity (Ink parity G33): app.unmount() runs teardown()+
  // resolveExit() without setting exitInitiated. A retained exit() (from
  // useAppContext()) called AFTER unmount has started teardown must be a
  // complete no-op — it must not
  // overwrite the resolved exit value. waitUntilExit resolves the original
  // unmount value (undefined), NOT 'late'. Without the teardownStarted guard in
  // exit(), the late exit captures 'late' into pendingExitResult and 'late'
  // wins; the guard makes it a no-op.
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useAppContext().exit;
    return () => <Text>hello</Text>;
  });

  const { unmount, waitUntilExit } = await render(App);

  unmount();
  exitFn("late");

  await expect(waitUntilExit()).resolves.toBeUndefined();
});

test("retained exit() re-entered DURING unmount teardown writes is a no-op", async () => {
  // isUnmounting parity (Ink parity G33), faithful reentrancy: an exit() (from
  // useAppContext()) captured during setup is invoked re-entrantly from inside the stdout write
  // that unmount()'s final commit performs. teardownStarted is already true at
  // that point, so exit("reentrant") is a complete no-op and the original
  // unmount value (undefined) wins. Without the teardownStarted guard the
  // re-entrant exit would overwrite pendingExitResult before resolveExit runs.
  let exitFn: ((value?: unknown) => void) | undefined;
  let shouldReenterExit = false;
  let didReenterExit = false;

  const stdout = new Writable({
    write(
      _chunk: string | Uint8Array,
      _encoding: BufferEncoding,
      callback: (error?: Error) => void,
    ) {
      if (shouldReenterExit && !didReenterExit && exitFn) {
        didReenterExit = true;
        exitFn("reentrant");
      }
      callback();
    },
  }) as unknown as NodeJS.WriteStream;
  stdout.columns = 100;
  stdout.isTTY = true;

  const App = defineComponent(() => {
    const { exit } = useAppContext();
    onMounted(() => {
      exitFn = exit;
    });
    return () => <Text>Hello</Text>;
  });

  const app = createApp(App);
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

  // Let the app mount and capture exitFn, then trigger unmount. unmount()'s
  // final commit writes to stdout, which re-enters exit("reentrant") while
  // teardownStarted is already true.
  await new Promise((r) => setTimeout(r, 0));
  shouldReenterExit = true;
  app.unmount();

  const result = await app.waitUntilExit();
  expect(didReenterExit).toBe(true);
  expect(result).toBeUndefined();
});

test("single exit('x') resolves with 'x' (control)", async () => {
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useAppContext().exit;
    return () => <Text>hello</Text>;
  });

  const { waitUntilExit } = await render(App);

  exitFn("x");
  await expect(waitUntilExit()).resolves.toBe("x");
});

// --- Exit re-entrance tests (ported from Ink render.tsx) ---

test("waitUntilExit resolves FIRST exit value when duplicate exits happen during teardown", async () => {
  // First-call-wins (Ink parity G33): the FIRST exit() captures the value and
  // initiates teardown; a later exit() is a complete no-op, so waitUntilExit
  // resolves "first" regardless of write-barrier timing.
  let barrierWriteCallback: (() => void) | undefined;

  const stdout = new Writable({
    write(
      chunk: string | Uint8Array,
      _encoding: BufferEncoding,
      callback: (error?: Error) => void,
    ) {
      if (isWriteBarrierChunk(chunk)) {
        barrierWriteCallback = callback;
        return;
      }
      callback();
    },
  }) as unknown as NodeJS.WriteStream;
  stdout.columns = 100;

  const App = defineComponent(() => {
    const { exit } = useAppContext();
    onMounted(() => {
      exit("first");
      setTimeout(() => exit("second"), 0);
    });
    return () => <Text>Hello</Text>;
  });

  const app = createApp(App);
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

  const exitPromise = app.waitUntilExit();
  await new Promise((r) => setTimeout(r, 0));

  if (barrierWriteCallback) {
    barrierWriteCallback();
  }
  const result = await exitPromise;
  expect(result).toBe("first");
});

test("waitUntilExit resolves FIRST exit value when exit is re-entered during unmount writes", async () => {
  // First-call-wins (Ink parity G33): a re-entrant exit("second") during the
  // unmount write is a no-op because exitInitiated is already set, so
  // waitUntilExit resolves the original "first" value.
  let exitFn: ((value?: unknown) => void) | undefined;
  let shouldReenterExit = false;
  let didReenterExit = false;

  const stdout = new Writable({
    write(
      _chunk: string | Uint8Array,
      _encoding: BufferEncoding,
      callback: (error?: Error) => void,
    ) {
      if (shouldReenterExit && !didReenterExit && exitFn) {
        didReenterExit = true;
        exitFn("second");
      }
      callback();
    },
  }) as unknown as NodeJS.WriteStream;
  stdout.columns = 100;
  stdout.isTTY = true;

  const App = defineComponent(() => {
    const { exit } = useAppContext();
    onMounted(() => {
      exitFn = exit;
      shouldReenterExit = true;
      exit("first");
    });
    return () => <Text>Hello</Text>;
  });

  const app = createApp(App);
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

  const result = await app.waitUntilExit();
  expect(didReenterExit).toBe(true);
  expect(result).toBe("first");
});

test("exit with cross-realm Error resolves after stdout write callback", async () => {
  // vue-tui uses `instanceof Error` to distinguish errors from result values.
  // A cross-realm Error (created in a different VM context) fails the
  // instanceof check, so it is treated as a result value and resolves
  // rather than rejecting. This differs from Ink which rejects. The test
  // verifies the write-callback timing: resolution waits for the barrier.
  const vm = await import("node:vm");
  let writeCallbackFired = false;
  let barrierWriteCallbackFired = false;

  const stdout = new Writable({
    write(
      chunk: string | Uint8Array,
      _encoding: BufferEncoding,
      callback: (error?: Error) => void,
    ) {
      setTimeout(() => {
        writeCallbackFired = true;
        if (isWriteBarrierChunk(chunk)) {
          barrierWriteCallbackFired = true;
        }
        callback();
      }, 150);
    },
  }) as unknown as NodeJS.WriteStream;
  stdout.columns = 100;

  const foreignError = vm.runInNewContext("new Error('boom')") as Error;

  const App = defineComponent(() => {
    const { exit } = useAppContext();
    onMounted(() => {
      setTimeout(() => exit(foreignError), 0);
    });
    return () => <Text>Hello</Text>;
  });

  const app = createApp(App);
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

  // Cross-realm Error fails instanceof check, so exit resolves with the
  // error object as a value instead of rejecting.
  const result = await app.waitUntilExit();
  expect(result).toBe(foreignError);
  expect(writeCallbackFired).toBe(true);
  expect(barrierWriteCallbackFired).toBe(true);
});
