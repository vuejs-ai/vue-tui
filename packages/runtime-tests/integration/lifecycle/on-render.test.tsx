import { PassThrough } from "node:stream";
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useInput } from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

async function within<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), 500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("onRender callback is called with renderTime on each commit", async () => {
  const renderTimes: number[] = [];

  const App = defineComponent(() => () => <Text>hello</Text>);

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  app.mount({
    stdout,
    stdin,
    stderr,
    maxFps: 0,
    onRender: (info) => {
      renderTimes.push(info.renderTime);
    },
  });

  await nextTick();
  await nextTick();

  expect(renderTimes.length).toBeGreaterThanOrEqual(1);
  expect(renderTimes[0]).toBeTypeOf("number");
  expect(renderTimes[0]).toBeGreaterThanOrEqual(0);

  app.unmount();
});

test("onRender is called on subsequent state updates", async () => {
  const renderTimes: number[] = [];
  const msg = shallowRef("a");

  const App = defineComponent(() => {
    return () => <Text>{msg.value}</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  app.mount({
    stdout,
    stdin,
    stderr,
    maxFps: 0,
    onRender: (info) => {
      renderTimes.push(info.renderTime);
    },
  });

  await nextTick();
  await nextTick();
  const initialCount = renderTimes.length;

  msg.value = "b";
  await nextTick();
  await nextTick();

  // Ink render.tsx:892-950 resets the onRender stub between rerenders and asserts
  // callCount === 1 for each — i.e. exactly ONE onRender per state mutation, not
  // ">". With maxFps: 0 every commit is synchronous, so a single mutation must add
  // exactly one render (no coalescing, no double-fire).
  expect(renderTimes.length).toBe(initialCount + 1);

  // A second, distinct mutation also adds exactly one more.
  msg.value = "c";
  await nextTick();
  await nextTick();
  expect(renderTimes.length).toBe(initialCount + 2);

  app.unmount();
});

test("no onRender callback when option is not provided", async () => {
  const App = defineComponent(() => () => <Text>no callback</Text>);

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  const writes: string[] = [];
  (stdout as unknown as PassThrough).on("data", (chunk: Buffer) => {
    writes.push(chunk.toString());
  });

  app.mount({
    stdout,
    stdin,
    stderr,
    maxFps: 0,
  });

  // Two ticks: first flushes Vue scheduler, second flushes commit scheduler.
  await nextTick();
  await nextTick();

  expect(writes.some((w) => w.includes("no callback"))).toBe(true);
  app.unmount();
});

async function expectOnRenderWriteBeforeFrame(
  options: {
    maxFps?: number;
    isScreenReaderEnabled?: boolean;
  } = {},
) {
  const App = defineComponent(() => () => <Text>Hello</Text>);

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  const writes: string[] = [];
  (stdout as unknown as PassThrough).on("data", (chunk: Buffer) => {
    writes.push(chunk.toString());
  });

  app.mount({
    stdout,
    stdin,
    stderr,
    ...options,
    onRender: () => {
      stdout.write("R");
    },
  });

  await nextTick();
  await nextTick();

  const output = writes.join("");
  expect(output.indexOf("R")).toBeGreaterThanOrEqual(0);
  expect(output.indexOf("Hello")).toBeGreaterThanOrEqual(0);
  expect(output.indexOf("R")).toBeLessThan(output.indexOf("Hello"));

  app.unmount();
}

test("onRender fires before unthrottled output is written", async () => {
  await expectOnRenderWriteBeforeFrame({ maxFps: 0 });
});

test("onRender fires before interactive output is written", async () => {
  await expectOnRenderWriteBeforeFrame();
});

test("onRender fires before screen-reader output is written", async () => {
  await expectOnRenderWriteBeforeFrame({ isScreenReaderEnabled: true });
});

test("onRender fires on input-triggered state update", async () => {
  // Mirrors the third assertion in Ink's "outputs renderTime when onRender is passed":
  // after an initial render and a manual rerender, a useInput-driven state
  // update should also fire onRender with a valid renderTime.
  const renderTimes: number[] = [];
  const received = shallowRef("init");

  const App = defineComponent(() => {
    useInput((event) => {
      if (event.kind === "text") received.value = event.text;
    });
    return () => <Text>{received.value}</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  app.mount({
    stdout,
    stdin,
    stderr,
    maxFps: 0,
    onRender: (info) => {
      renderTimes.push(info.renderTime);
    },
  });

  await nextTick();
  await nextTick();
  const initialCount = renderTimes.length;
  expect(initialCount).toBeGreaterThanOrEqual(1);
  expect(renderTimes[0]).toBeGreaterThanOrEqual(0);

  // Simulate stdin input → useInput → state update → re-render
  stdin.emit("data", "a");
  await nextTick();
  await nextTick();

  // Ink render.tsx:892-950: a single useInput-driven state update fires onRender
  // EXACTLY once (callCount === 1 after resetHistory), not just "> initial".
  expect(renderTimes.length).toBe(initialCount + 1);
  expect(renderTimes.at(-1)).toBeGreaterThanOrEqual(0);

  // A second keystroke that CHANGES the value adds exactly one more render.
  stdin.emit("data", "b");
  await nextTick();
  await nextTick();
  expect(renderTimes.length).toBe(initialCount + 2);

  app.unmount();
});

test("an onRender failure exits only its app and does not block later commits", async () => {
  const failure = new Error("onRender failure");
  const Broken = defineComponent(() => () => <Text>broken</Text>);
  const brokenStdout = makeFakeWritable({ columns: 80, rows: 24 });
  const brokenStderr = makeFakeWritable({ columns: 80, rows: 24 });
  const { stream: brokenStdin } = makeFakeStdin();
  const broken = createApp(Broken);

  let synchronousMountError: unknown;
  let exitError: unknown;
  try {
    try {
      broken.mount({
        stdout: brokenStdout,
        stderr: brokenStderr,
        stdin: brokenStdin,
        maxFps: 0,
        onRender() {
          throw failure;
        },
      });
    } catch (error) {
      synchronousMountError = error;
    }
    if (synchronousMountError === undefined) {
      try {
        await within(broken.waitUntilExit(), "onRender failure exit");
      } catch (error) {
        exitError = error;
      }
    }
  } finally {
    broken.unmount();
    await Promise.allSettled([broken.waitUntilExit()]);
  }

  const Healthy = defineComponent(() => () => <Text>healthy</Text>);
  const healthyStdout = makeFakeWritable({ columns: 80, rows: 24 });
  const healthyStderr = makeFakeWritable({ columns: 80, rows: 24 });
  const { stream: healthyStdin } = makeFakeStdin();
  const healthy = createApp(Healthy);
  let laterError: unknown;
  try {
    healthy.mount({
      stdout: healthyStdout,
      stderr: healthyStderr,
      stdin: healthyStdin,
      maxFps: 0,
    });
    await within(healthy.waitUntilRenderFlush(), "healthy render flush").catch((error) => {
      laterError = error;
    });
  } finally {
    healthy.unmount();
    await Promise.allSettled([healthy.waitUntilExit()]);
  }

  expect(synchronousMountError).toBeUndefined();
  expect(exitError).toBe(failure);
  expect(laterError).toBeUndefined();
});
