import { Writable } from "node:stream";
import { defineComponent, nextTick, onMounted, onScopeDispose, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { createApp, Text, useApp } from "@vue-tui/runtime";
import { isWriteBarrierChunk, makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

test("useApp().exit() restores the host before waitUntilExit resolves", async () => {
  let exit!: () => void;
  let disposed = false;
  const App = defineComponent(() => {
    exit = useApp().exit;
    onScopeDispose(() => {
      disposed = true;
    });
    return () => <Text>running</Text>;
  });

  const result = await render(App);
  exit();
  await result.waitUntilExit();
  expect(disposed).toBe(true);
});

test("exit(error) rejects with the same error", async () => {
  let exit!: (error?: Error) => void;
  const App = defineComponent(() => {
    exit = useApp().exit;
    return () => <Text>x</Text>;
  });
  const result = await render(App);
  const error = new Error("boom");
  exit(error);
  await expect(result.waitUntilExit()).rejects.toBe(error);
});

test("unmount resolves waitUntilExit and is idempotent after exit", async () => {
  let exit!: () => void;
  const App = defineComponent(() => {
    exit = useApp().exit;
    return () => <Text>x</Text>;
  });
  const result = await render(App);
  exit();
  await expect(result.waitUntilExit()).resolves.toBeUndefined();
  expect(() => result.unmount()).not.toThrow();
});

test("the first exit(error) wins", async () => {
  let exit!: (error?: Error) => void;
  const App = defineComponent(() => {
    exit = useApp().exit;
    return () => <Text>x</Text>;
  });
  const result = await render(App);
  const first = new Error("first");
  exit(first);
  exit(new Error("second"));
  await expect(result.waitUntilExit()).rejects.toBe(first);
});

test("invalid exit inputs throw synchronously without consuming the first valid exit", async () => {
  let exit!: (value?: unknown) => void;
  const value = shallowRef("running");
  const App = defineComponent(() => {
    exit = useApp().exit as (value?: unknown) => void;
    return () => <Text>{value.value}</Text>;
  });
  const result = await render(App);

  const invalidValues = ["bad", null, 0, false, {}, Symbol("bad")];
  for (const invalid of invalidValues) {
    expect(() => exit(invalid)).toThrow(
      new TypeError("useApp().exit() accepts only an Error or no argument"),
    );
  }

  value.value = "still running";
  await nextTick();
  await result.waitUntilRenderFlush();
  expect(result.lastFrame()).toContain("still running");

  const selected = new Error("selected after invalid calls");
  exit(selected);
  await expect(result.waitUntilExit()).rejects.toBe(selected);
});

test("later exit calls are no-ops and do not inspect hostile values", async () => {
  let exit!: (value?: unknown) => void;
  const App = defineComponent(() => {
    exit = useApp().exit as (value?: unknown) => void;
    return () => <Text>x</Text>;
  });
  const result = await render(App);
  let inspected = 0;
  const hostile = new Proxy(
    {},
    {
      get() {
        inspected++;
        throw new Error("must not inspect a late exit value");
      },
    },
  );

  exit();
  expect(() => exit(hostile)).not.toThrow();
  await expect(result.waitUntilExit()).resolves.toBeUndefined();
  expect(() => exit(hostile)).not.toThrow();
  expect(inspected).toBe(0);
});

test("an invalid retained exit is inert once unmount cleanup has started", async () => {
  let exit!: (value?: unknown) => void;
  let cleanupError: unknown;
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error("must not inspect during teardown");
      },
    },
  );
  const App = defineComponent(() => {
    exit = useApp().exit as (value?: unknown) => void;
    onScopeDispose(() => {
      try {
        exit(hostile);
      } catch (error) {
        cleanupError = error;
      }
    });
    return () => <Text>x</Text>;
  });
  const result = await render(App);

  result.unmount();
  await expect(result.waitUntilExit()).resolves.toBeUndefined();
  expect(cleanupError).toBeUndefined();
});

test("onScopeDispose runs for an error exit", async () => {
  let exit!: (error?: Error) => void;
  let disposed = false;
  const App = defineComponent(() => {
    exit = useApp().exit;
    onScopeDispose(() => {
      disposed = true;
    });
    return () => <Text>x</Text>;
  });
  const result = await render(App);
  exit(new Error("errored"));
  await result.waitUntilExit().catch(() => {});
  expect(disposed).toBe(true);
});

test("a retained exit() called during unmount output is a no-op", async () => {
  let exit: (() => void) | undefined;
  let reenter = false;
  let didReenter = false;
  const stdout = new Writable({
    write(_chunk, _encoding, callback) {
      if (reenter && !didReenter && exit) {
        didReenter = true;
        exit();
      }
      callback();
    },
  }) as unknown as NodeJS.WriteStream;
  stdout.columns = 100;
  stdout.rows = 20;
  stdout.isTTY = true;

  const App = defineComponent(() => {
    const app = useApp();
    onMounted(() => {
      exit = app.exit;
    });
    return () => <Text>Hello</Text>;
  });
  const app = createApp(App);
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stderr, stdin });
  await app.waitUntilRenderFlush();

  reenter = true;
  app.unmount();
  await expect(app.waitUntilExit()).resolves.toBeUndefined();
  expect(didReenter).toBe(true);
});

test("a cross-realm Error rejects after the stdout barrier", async () => {
  const vm = await import("node:vm");
  let barrierCallbackFired = false;
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      setTimeout(() => {
        if (isWriteBarrierChunk(chunk)) barrierCallbackFired = true;
        callback();
      }, 20);
    },
  }) as unknown as NodeJS.WriteStream;
  stdout.columns = 100;
  const foreignError = vm.runInNewContext("new Error('boom')") as Error;
  const App = defineComponent(() => {
    const { exit } = useApp();
    onMounted(() => exit(foreignError));
    return () => <Text>Hello</Text>;
  });
  const app = createApp(App);
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stderr, stdin });

  await expect(app.waitUntilExit()).rejects.toBe(foreignError);
  expect(barrierCallbackFired).toBe(true);
});
