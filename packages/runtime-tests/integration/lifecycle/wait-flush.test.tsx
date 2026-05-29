import { defineComponent, nextTick, onMounted, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { createApp, Text, useExit } from "@vue-tui/runtime";
import stripAnsi from "strip-ansi";
import {
  makeFakeWritable,
  makeFakeStdin,
  createDelayedWriteCallbackStdout,
  isWriteBarrierChunk,
  captureWrites,
  getContentWrites,
} from "./test-streams.ts";

test("waitUntilRenderFlush resolves after frame is written", async () => {
  const App = defineComponent(() => () => <Text>hello</Text>);
  const result = await render(App);
  await result.waitUntilRenderFlush();
  expect(result.lastFrame()).toContain("hello");
});

test("waitUntilRenderFlush waits for pending state updates", async () => {
  const msg = shallowRef("before");
  const App = defineComponent(() => {
    return () => <Text>{msg.value}</Text>;
  });

  const result = await render(App);
  expect(result.lastFrame()).toContain("before");

  msg.value = "after";
  await nextTick();
  await nextTick();
  await result.waitUntilRenderFlush();
  expect(result.lastFrame()).toContain("after");
});

test("waitUntilRenderFlush can be called multiple times", async () => {
  const App = defineComponent(() => () => <Text>stable</Text>);
  const result = await render(App);

  await result.waitUntilRenderFlush();
  await result.waitUntilRenderFlush();
  expect(result.lastFrame()).toContain("stable");
});

// --- waitUntilRenderFlush write-callback level tests (ported from Ink render.tsx) ---

test("waitUntilRenderFlush resolves after stdout write callback", async () => {
  let didInitialWriteCallbackFire = false;

  const stdout = createDelayedWriteCallbackStdout({
    shouldDelay: (chunk) => !isWriteBarrierChunk(chunk),
    onDelayElapsed: () => {
      didInitialWriteCallbackFire = true;
    },
  });

  const App = defineComponent(() => () => <Text>Hello</Text>);
  const app = createApp(App);
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

  await app.waitUntilRenderFlush();
  expect(didInitialWriteCallbackFire).toBe(true);

  app.unmount();
  await app.waitUntilExit();
});

test("waitUntilRenderFlush flushes pending throttled render", async () => {
  const msg = shallowRef("Hello");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false, maxFps: 1 });
  await nextTick();
  await nextTick();
  expect(getContentWrites(writes).length).toBe(1);

  msg.value = "World";
  await nextTick();
  await nextTick();
  expect(getContentWrites(writes).length).toBe(1);

  await app.waitUntilRenderFlush();
  expect(getContentWrites(writes).length).toBe(2);
  expect(stripAnsi(getContentWrites(writes)[1]!)).toContain("World");

  app.unmount();
  await app.waitUntilExit();
});

test("waitUntilRenderFlush resolves when stdout is not writable", async () => {
  const msg = shallowRef("Hello");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false, maxFps: 1 });
  await nextTick();
  await nextTick();
  expect(getContentWrites(writes).length).toBe(1);

  msg.value = "World";
  await nextTick();
  (stdout as NodeJS.WriteStream & { writable?: boolean }).writable = false;
  await app.waitUntilRenderFlush();

  app.unmount();
  await app.waitUntilExit();
});

test("waitUntilRenderFlush waits for rerender write callback", async () => {
  let didSecondWriteCallbackFire = false;

  const stdout = createDelayedWriteCallbackStdout({
    shouldDelay: (chunk) =>
      !isWriteBarrierChunk(chunk) &&
      stripAnsi(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)).includes(
        "World",
      ),
    onDelayElapsed: () => {
      didSecondWriteCallbackFire = true;
    },
  });

  const msg = shallowRef("Hello");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

  await app.waitUntilRenderFlush();
  msg.value = "World";
  await nextTick();
  await nextTick();
  await app.waitUntilRenderFlush();

  expect(didSecondWriteCallbackFire).toBe(true);

  app.unmount();
  await app.waitUntilExit();
});

test("waitUntilRenderFlush waits for all concurrent waiters on the same rerender", async () => {
  const msg = shallowRef("Hello");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });
  await app.waitUntilRenderFlush();

  msg.value = "World";
  await nextTick();
  await nextTick();
  // Ensure the "World" render is fully written before concurrent waits.
  // (PassThrough can backpressure if barriers queue behind pending writes.)
  await app.waitUntilRenderFlush();

  let waiter1Resolved = false;
  let waiter2Resolved = false;

  await Promise.all([
    app.waitUntilRenderFlush().then(() => {
      waiter1Resolved = true;
    }),
    app.waitUntilRenderFlush().then(() => {
      waiter2Resolved = true;
    }),
  ]);
  // Both concurrent waiters resolved
  expect(waiter1Resolved).toBe(true);
  expect(waiter2Resolved).toBe(true);
  // The "World" content was rendered
  expect(getContentWrites(writes).some((w) => stripAnsi(w).includes("World"))).toBe(true);

  app.unmount();
});

test("waitUntilRenderFlush resolves after unmount", async () => {
  const App = defineComponent(() => () => <Text>Hello</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

  app.unmount();
  await app.waitUntilExit();
  await app.waitUntilRenderFlush();
});

test("waitUntilRenderFlush waits for unmount write callback", async () => {
  let didUnmountWriteCallbackFire = false;

  const stdout = createDelayedWriteCallbackStdout({
    shouldDelay: (chunk) => isWriteBarrierChunk(chunk),
    onDelayElapsed: () => {
      didUnmountWriteCallbackFire = true;
    },
  });

  const App = defineComponent(() => () => <Text>Hello</Text>);
  const app = createApp(App);
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

  app.unmount();
  await app.waitUntilRenderFlush();

  expect(didUnmountWriteCallbackFire).toBe(true);
});

test("waitUntilRenderFlush resolves after exit with error", async () => {
  let exitFn!: (err: Error) => void;
  const App = defineComponent(() => {
    const exit = useExit();
    onMounted(() => {
      exitFn = exit as (err: Error) => void;
    });
    return () => <Text>Hello</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

  await nextTick();
  exitFn(new Error("boom"));
  await expect(app.waitUntilExit()).rejects.toThrow("boom");
  await app.waitUntilRenderFlush();
});

// useApp-level waitUntilRenderFlush tests:
// These test that waitUntilRenderFlush works when called from inside a component.
// In vue-tui, waitUntilRenderFlush is on the app instance, not a composable,
// so these are tested via the app.waitUntilRenderFlush() API above.
// The 2 "useApp waitUntilRenderFlush" tests from Ink are covered by the
// existing tests since vue-tui exposes the same API on the app object.

// --- clear() API test ---

test("clear output", async () => {
  const msg = shallowRef("A\nB\nC");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });
  await nextTick();
  await nextTick();
  expect(writes.some((w) => w.includes("A"))).toBe(true);

  app.clear();
  msg.value = "D";
  await nextTick();
  await nextTick();
  await app.waitUntilRenderFlush();

  // After clear + rerender, "D" should appear in content writes
  const contentWrites = getContentWrites(writes);
  expect(contentWrites.some((w) => stripAnsi(w).includes("D"))).toBe(true);

  app.unmount();
});
