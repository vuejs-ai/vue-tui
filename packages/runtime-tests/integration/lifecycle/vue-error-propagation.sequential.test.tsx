import ansiEscapes from "ansi-escapes";
import { defineComponent, nextTick, onErrorCaptured, onScopeDispose, shallowRef } from "vue";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { Box, createApp, Text, useApp, useInput, useLayoutWidth } from "@vue-tui/runtime";
import { yogaNodeTracker } from "../../../runtime/dist/internal.mjs";
import { createInternalMountOptions } from "../../../runtime/dist/internal.mjs";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

function expectExitToRemainPending(app: ReturnType<typeof createApp>): Promise<void> {
  let settled = false;
  void app.waitUntilExit().then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  return Promise.resolve().then(() => {
    expect(settled).toBe(false);
  });
}

test.sequential("a user error-capture hook controls descendant propagation", async () => {
  const originalError = new Error("captured by the user root");
  const captured: unknown[] = [];
  const handled: unknown[] = [];
  let childDisposed = false;

  const Child = defineComponent(() => {
    onScopeDispose(() => {
      childDisposed = true;
    });
    throw originalError;
  });
  const Root = defineComponent({
    setup(_props, { expose }) {
      expose({ ping: () => "pong" });
      onErrorCaptured((error) => {
        captured.push(error);
        return false;
      });
      return () => <Child />;
    },
  });

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);
  const userHandler = (error: unknown) => {
    handled.push(error);
  };
  app.config.warnHandler = () => {};
  app.config.errorHandler = userHandler;

  const root = app.mount({ stdout, stderr, stdin, patchConsole: false });

  expect((root as unknown as { ping(): string }).ping()).toBe("pong");
  expect(captured).toEqual([originalError]);
  expect(handled).toEqual([]);
  expect(app.config.errorHandler).toBe(userHandler);
  await expectExitToRemainPending(app);

  app.unmount();
  await expect(app.waitUntilExit()).resolves.toBeUndefined();
  expect(childDisposed).toBe(true);
});

test.sequential("the user's app error handler handles an initial component error without exit", async () => {
  const originalError = new Error("handled initial setup");
  const handled: Array<{ error: unknown; info: string }> = [];
  const Child = defineComponent(() => {
    throw originalError;
  });
  const Root = defineComponent(() => () => <Child />);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const stderrWrites = captureWrites(stderr);
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);
  const userHandler: NonNullable<typeof app.config.errorHandler> = (error, _instance, info) => {
    handled.push({ error, info });
  };
  app.config.warnHandler = () => {};
  app.config.errorHandler = userHandler;

  app.mount({ stdout, stderr, stdin, patchConsole: false });

  expect(handled).toEqual([{ error: originalError, info: "setup function" }]);
  expect(app.config.errorHandler).toBe(userHandler);
  expect(stderrWrites.join("")).toBe("");
  await expectExitToRemainPending(app);

  app.unmount();
  await expect(app.waitUntilExit()).resolves.toBeUndefined();
});

test.sequential("a handled later render error follows Vue continuation without automatic exit", async () => {
  const trigger = shallowRef(false);
  const originalError = new Error("handled later render");
  const handled: unknown[] = [];
  const Root = defineComponent(() => {
    return () => {
      if (trigger.value) throw originalError;
      return <Text>ready</Text>;
    };
  });
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);
  app.config.warnHandler = () => {};
  app.config.errorHandler = (error) => {
    handled.push(error);
  };
  app.mount({ stdout, stderr, stdin, patchConsole: false });

  trigger.value = true;
  await expect(nextTick()).resolves.toBeUndefined();

  expect(handled).toEqual([originalError]);
  await expectExitToRemainPending(app);
  app.unmount();
  await expect(app.waitUntilExit()).resolves.toBeUndefined();
});

test.sequential("an unhandled later render error rejects Vue's tick but does not exit Runtime", async () => {
  const trigger = shallowRef(false);
  const originalError = new Error("unhandled later render");
  const Root = defineComponent(() => {
    return () => {
      if (trigger.value) throw originalError;
      return <Text>ready</Text>;
    };
  });
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);
  app.config.warnHandler = () => {};
  vi.spyOn(console, "error").mockImplementation(() => {});
  app.mount({ stdout, stderr, stdin, patchConsole: false });

  trigger.value = true;
  await expect(nextTick()).rejects.toBe(originalError);

  await expectExitToRemainPending(app);
  app.unmount();
  await expect(app.waitUntilExit()).resolves.toBeUndefined();
});

test.sequential("a component error during resize remains a Vue error without exiting Runtime", async () => {
  const originalError = new Error("unhandled resize render");
  const Root = defineComponent(() => {
    const width = useLayoutWidth();
    return () => {
      if (width.value === 40) throw originalError;
      return <Text>{width.value}</Text>;
    };
  });
  const stdout = makeFakeWritable({ columns: 80, rows: 24 });
  const stderr = makeFakeWritable({ columns: 80, rows: 24 });
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);
  app.config.warnHandler = () => {};
  vi.spyOn(console, "error").mockImplementation(() => {});
  app.mount({ stdout, stderr, stdin, patchConsole: false });

  stdout.columns = 40;
  stdout.emit("resize");
  await expect(nextTick()).rejects.toBe(originalError);
  await new Promise<void>((resolve) => setImmediate(resolve));

  await expectExitToRemainPending(app);
  app.unmount();
  await expect(app.waitUntilExit()).resolves.toBeUndefined();
});

test.sequential("an unhandled initial component error is not reported again by Runtime", async () => {
  const originalError = new Error("ordinary initial component error");
  const Root = defineComponent(() => {
    throw originalError;
  });
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const stderrWrites = captureWrites(stderr);
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);
  app.config.warnHandler = () => {};
  vi.spyOn(console, "error").mockImplementation(() => {});
  const exited = app.waitUntilExit();

  let mountError: unknown;
  try {
    app.mount({ stdout, stderr, stdin, patchConsole: false });
  } catch (error) {
    mountError = error;
  }

  expect(mountError).toBe(originalError);
  await expect(exited).rejects.toBe(originalError);
  expect(stderrWrites.join("")).toBe("");
});

test.sequential("the first explicit error exit wins over a later initial component throw", async () => {
  const selectedError = new Error("selected explicit exit");
  const laterError = new Error("later component throw");
  const Root = defineComponent(() => {
    useApp().exit(selectedError);
    throw laterError;
  });
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);
  app.config.warnHandler = () => {};
  vi.spyOn(console, "error").mockImplementation(() => {});
  const exited = app.waitUntilExit();

  let mountError: unknown;
  try {
    app.mount({ stdout, stderr, stdin, patchConsole: false });
  } catch (error) {
    mountError = error;
  }

  expect(mountError).toBe(selectedError);
  await expect(exited).rejects.toBe(selectedError);
});

test.sequential("an unhandled initial non-Error throw preserves Vue's exact value", async () => {
  const thrownValue = "plain initial throw";
  const Root = defineComponent(() => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- Vue accepts arbitrary thrown JavaScript values
    throw thrownValue;
  });
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const stderrWrites = captureWrites(stderr);
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);
  app.config.warnHandler = () => {};
  vi.spyOn(console, "error").mockImplementation(() => {});
  const exited = app.waitUntilExit();

  let mountThrew = false;
  let mountError: unknown;
  try {
    app.mount({ stdout, stderr, stdin, patchConsole: false });
  } catch (error) {
    mountThrew = true;
    mountError = error;
  }

  expect(mountThrew).toBe(true);
  expect(mountError).toBe(thrownValue);
  await expect(exited).rejects.toBe(thrownValue);
  expect(stderrWrites.join("")).toBe("");
});

test.sequential("a partial initial mount restores terminal state and releases every Yoga host", async () => {
  yogaNodeTracker.reset();
  const before = yogaNodeTracker.snapshot();
  const originalError = new Error("partial child setup");
  const cleanupError = new Error("root partial cleanup");
  const disposed: string[] = [];
  const stdout = makeFakeWritable({ columns: 80, rows: 24 });
  const stderr = makeFakeWritable({ columns: 80, rows: 24 });
  const writes = captureWrites(stdout);
  const { stream: stdin } = makeFakeStdin();
  const rawModeCalls: boolean[] = [];
  const onRender = vi.fn();
  let renderCallsBeforeThrow = 0;
  let outputLengthBeforeThrow = 0;
  stdin.setRawMode = ((mode: boolean) => {
    rawModeCalls.push(mode);
    return stdin;
  }) as NodeJS.ReadStream["setRawMode"];

  const AllocatedLeaf = defineComponent(() => {
    onScopeDispose(() => {
      disposed.push("leaf");
    });
    return () => <Text>allocated before failure</Text>;
  });
  const ThrowingLeaf = defineComponent(() => {
    onScopeDispose(() => {
      disposed.push("thrower");
    });
    renderCallsBeforeThrow = onRender.mock.calls.length;
    outputLengthBeforeThrow = writes.join("").length;
    throw originalError;
  });
  const Root = defineComponent(() => {
    useInput(() => {});
    onScopeDispose(() => {
      disposed.push("root");
      throw cleanupError;
    });
    return () => (
      <Box>
        <AllocatedLeaf />
        <ThrowingLeaf />
      </Box>
    );
  });

  const app = createApp(Root);
  app.config.warnHandler = () => {};
  vi.spyOn(console, "error").mockImplementation(() => {});

  let thrown: unknown;
  try {
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        mode: "fullscreen",
        patchConsole: false,
        onRender,
      }),
    );
  } catch (error) {
    thrown = error;
  }
  if (thrown === undefined) {
    app.unmount();
  }

  expect(thrown).toBe(originalError);
  await expect(app.waitUntilExit()).rejects.toBe(originalError);
  expect(disposed.sort()).toEqual(["leaf", "root", "thrower"]);
  expect(rawModeCalls).toContain(true);
  expect(rawModeCalls.lastIndexOf(false)).toBeGreaterThan(rawModeCalls.indexOf(true));
  const output = writes.join("");
  expect(output).toContain(ansiEscapes.enterAlternativeScreen);
  expect(output).toContain(ansiEscapes.exitAlternativeScreen);
  expect(onRender).toHaveBeenCalledTimes(renderCallsBeforeThrow);
  expect(output.slice(outputLengthBeforeThrow)).not.toContain(ansiEscapes.clearViewport);

  const after = yogaNodeTracker.snapshot();
  expect(after.created).toBeGreaterThan(before.created);
  expect(after.freed - before.freed).toBe(after.created - before.created);
  expect(after.live).toBe(before.live);

  const replacement = createApp(defineComponent(() => () => <Text>replacement</Text>));
  const { stream: replacementStdin } = makeFakeStdin();
  replacement.mount({
    stdout,
    stderr,
    stdin: replacementStdin,
    patchConsole: false,
  });
  replacement.unmount();
  await expect(replacement.waitUntilExit()).resolves.toBeUndefined();
  expect(yogaNodeTracker.snapshot().live).toBe(before.live);
});

test.sequential("one scope cleanup failure does not strand descendant cleanup", async () => {
  const cleanupError = new Error("root cleanup failed");
  const disposed: string[] = [];
  const Child = defineComponent(() => {
    onScopeDispose(() => {
      disposed.push("child");
    });
    return () => <Text>{{ default: () => "child" }}</Text>;
  });
  const Root = defineComponent(() => {
    onScopeDispose(() => {
      disposed.push("root");
      throw cleanupError;
    });
    return () => <Child />;
  });
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);
  app.config.warnHandler = () => {};
  app.mount({ stdout, stderr, stdin, patchConsole: false });

  app.unmount();

  await expect(app.waitUntilExit()).rejects.toBe(cleanupError);
  expect(disposed.sort()).toEqual(["child", "root"]);
});

test.sequential("repeated scope-cleanup registrations retain Vue's invocation count", async () => {
  let cleanupCalls = 0;
  const cleanup = () => {
    cleanupCalls++;
  };
  const Root = defineComponent(() => {
    onScopeDispose(cleanup);
    onScopeDispose(cleanup);
    return () => <Text>{{ default: () => "duplicate cleanup" }}</Text>;
  });
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(Root);
  app.mount({ stdout, stderr, stdin, patchConsole: false });

  app.unmount();

  await expect(app.waitUntilExit()).resolves.toBeUndefined();
  expect(cleanupCalls).toBe(2);
});
