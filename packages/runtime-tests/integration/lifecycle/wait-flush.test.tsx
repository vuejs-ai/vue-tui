import { defineComponent, nextTick, onMounted, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { createApp, Text, useApp } from "@vue-tui/runtime";
import stripAnsi from "strip-ansi";
import { createInternalMountOptions } from "../../../runtime/dist/internal.mjs";
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
  app.mount({ stdout, stdin, stderr });

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

  app.mount(createInternalMountOptions({ stdout, stdin, stderr, maxFps: 1 }));
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

test("waitUntilRenderFlush remains non-reporting when stdout becomes unwritable", async () => {
  const msg = shallowRef("Hello");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount(createInternalMountOptions({ stdout, stdin, stderr, maxFps: 1 }));
  await nextTick();
  await nextTick();
  expect(getContentWrites(writes).length).toBe(1);

  msg.value = "World";
  await nextTick();
  (stdout as NodeJS.WriteStream & { writable?: boolean }).writable = false;
  await expect(app.waitUntilRenderFlush()).resolves.toBeUndefined();
  expect(getContentWrites(writes).some((w) => stripAnsi(w).includes("World"))).toBe(false);

  await expect(app.waitUntilExit()).rejects.toThrow(
    "Runtime output stream became unwritable before exit settlement.",
  );
  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});

test("waitUntilExit waits for stdout barrier when only writableLength is exposed", async () => {
  let didBarrierCallbackFire = false;
  let barrierWrites = 0;
  const writes: string[] = [];
  const stdout = {
    columns: 80,
    rows: 24,
    isTTY: false,
    destroyed: false,
    writable: true,
    writableEnded: false,
    writableLength: 0,
    write(chunk: string | Uint8Array, callback?: () => void) {
      const text = String(chunk);
      writes.push(text);
      if (text === "" && callback) {
        barrierWrites++;
        setTimeout(() => {
          didBarrierCallbackFire = true;
          callback();
        }, 20);
      } else {
        callback?.();
      }
      return true;
    },
    on() {
      return this;
    },
    once() {
      return this;
    },
    off() {
      return this;
    },
  } as unknown as NodeJS.WriteStream;

  const App = defineComponent(() => () => <Text>Hello</Text>);
  const app = createApp(App);
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();

  app.mount({ stdout, stdin, stderr, patchConsole: false });
  await nextTick();
  await nextTick();

  const exited = app.waitUntilExit();
  app.unmount();
  await exited;

  expect(writes.some((w) => stripAnsi(w).includes("Hello"))).toBe(true);
  expect(barrierWrites).toBe(1);
  expect(didBarrierCallbackFire).toBe(true);
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
  app.mount({ stdout, stdin, stderr });

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

  app.mount({ stdout, stdin, stderr });
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

test("waitUntilRenderFlush resolves immediately after unmount", async () => {
  const App = defineComponent(() => () => <Text>Hello</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stdin, stderr });

  app.unmount();
  await app.waitUntilExit();
  await expect(app.waitUntilRenderFlush()).resolves.toBeUndefined();
});

test("waitUntilExit waits for the unmount write callback", async () => {
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
  app.mount({ stdout, stdin, stderr });

  app.unmount();
  await app.waitUntilExit();

  expect(didUnmountWriteCallbackFire).toBe(true);
});

test("waitUntilRenderFlush remains non-reporting after exit with error", async () => {
  let exitFn!: (err: Error) => void;
  const App = defineComponent(() => {
    const { exit } = useApp();
    onMounted(() => {
      exitFn = exit as (err: Error) => void;
    });
    return () => <Text>Hello</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stdin, stderr });

  await nextTick();
  exitFn(new Error("boom"));
  await expect(app.waitUntilExit()).rejects.toThrow("boom");
  await expect(app.waitUntilRenderFlush()).resolves.toBeUndefined();
});

// Port of Ink render.tsx:1528-1562 ("issue 596: useEffect can run before the
// first frame write callback"). Ink's React useEffect maps to Vue's onMounted:
// the lifecycle hook fires once the component is mounted, which happens BEFORE
// the terminal has acknowledged the first frame write. We delay the first
// content write's callback and assert onMounted has already run while that
// callback is still pending; after unmount + flush the write callback fires.
test("onMounted runs before the first frame write callback (issue 596)", async () => {
  let didInitialWriteCallbackFire = false;
  let didOnMountedRun = false;

  const stdout = createDelayedWriteCallbackStdout({
    shouldDelay: (chunk) => !isWriteBarrierChunk(chunk),
    onDelayElapsed: () => {
      didInitialWriteCallbackFire = true;
    },
  });

  const App = defineComponent(() => {
    onMounted(() => {
      didOnMountedRun = true;
    });
    return () => <Text>Hello</Text>;
  });

  const app = createApp(App);
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  app.mount({ stdout, stdin, stderr });

  // Let the mount + first write dispatch settle, but NOT past the write-callback
  // delay (delayMs defaults to 150). onMounted must have run; the first frame's
  // write callback must NOT have fired yet.
  await new Promise<void>((r) => setTimeout(r, 20));
  expect(didOnMountedRun).toBe(true);
  expect(didInitialWriteCallbackFire).toBe(false);

  // Draining the stream releases the delayed write callback.
  app.unmount();
  await app.waitUntilExit();
  expect(didInitialWriteCallbackFire).toBe(true);
});
