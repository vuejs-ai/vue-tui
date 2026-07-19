import { Writable } from "node:stream";
import { defineComponent, onMounted, onScopeDispose } from "vue";
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
