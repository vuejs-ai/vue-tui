// Sequential: uses vi.useFakeTimers, which mutates process-global timer functions.
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import stripAnsi from "strip-ansi";
import { createInternalMountOptions } from "../../../../../packages/runtime/dist/internal.mjs";
import {
  captureWrites,
  getContentWrites,
  makeFakeStdin,
  makeFakeWritable,
} from "../test-streams.ts";
import { FAKE_TIMER_OPTS } from "./harness.ts";

test.sequential("no throttled renders after unmount", async () => {
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    const msg = shallowRef("Foo");
    const App = defineComponent(() => () => <Text>{msg.value}</Text>);
    const app = createApp(App);
    const stdout = makeFakeWritable({ columns: 80 });
    const stderr = makeFakeWritable({ columns: 80 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app.mount({ stdout, stdin, stderr });
    await nextTick();
    await nextTick();

    const initialCount = getContentWrites(writes).length;
    expect(initialCount).toBeGreaterThanOrEqual(1);

    msg.value = "Bar";
    await nextTick();
    msg.value = "Baz";
    await nextTick();
    app.unmount();

    const countAfterUnmount = getContentWrites(writes).length;
    vi.advanceTimersByTime(1000);
    expect(getContentWrites(writes).length).toBe(countAfterUnmount);
  } finally {
    vi.useRealTimers();
  }
});

test.sequential("unmount forces pending throttled render", async () => {
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    const msg = shallowRef("Hello");
    const App = defineComponent(() => () => <Text>{msg.value}</Text>);
    const app = createApp(App);
    const stdout = makeFakeWritable({ columns: 80 });
    const stderr = makeFakeWritable({ columns: 80 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app.mount(createInternalMountOptions({ stdout, stdin, stderr, maxFps: 1 }));
    await nextTick();
    await nextTick();

    expect(getContentWrites(writes).length).toBe(1);
    expect(stripAnsi(getContentWrites(writes)[0]!)).toContain("Hello");

    msg.value = "Final";
    await nextTick();
    await nextTick();
    expect(getContentWrites(writes).length).toBe(1);

    app.unmount();
    const allContent = getContentWrites(writes).map((w) => stripAnsi(w));
    expect(allContent.some((c) => c.includes("Final"))).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

test.sequential("unmount cancels pending throttled log writes when stdout is ended", async () => {
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    const { PassThrough } = await import("node:stream");
    const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
    stdout.columns = 100;

    const writeErrors: Error[] = [];
    stdout.on("error", (error: Error) => writeErrors.push(error));

    const msg = shallowRef("Hello");
    const App = defineComponent(() => () => <Text>{msg.value}</Text>);
    const app = createApp(App);
    const stderr = makeFakeWritable({ columns: 80 });
    const { stream: stdin } = makeFakeStdin();

    app.mount(createInternalMountOptions({ stdout, stdin, stderr, maxFps: 1 }));
    await nextTick();
    await nextTick();

    msg.value = "World";
    await nextTick();
    stdout.end();
    app.unmount();
    vi.advanceTimersByTime(1000);

    const hasWriteAfterEndError = writeErrors.some(
      (e) => (e as NodeJS.ErrnoException).code === "ERR_STREAM_WRITE_AFTER_END",
    );
    expect(hasWriteAfterEndError).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test.sequential("unmount cancels pending throttled render when stdout is ended", async () => {
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    const { PassThrough } = await import("node:stream");

    // Baseline: mount + end + unmount without pending rerender
    const baseStdout = new PassThrough() as unknown as NodeJS.WriteStream;
    baseStdout.columns = 100;
    const BaseApp = defineComponent(() => () => <Text>Hello</Text>);
    const baseApp = createApp(BaseApp);
    const baseStderr = makeFakeWritable({ columns: 80 });
    const { stream: baseStdin } = makeFakeStdin();
    baseApp.mount(
      createInternalMountOptions({
        stdout: baseStdout,
        stdin: baseStdin,
        stderr: baseStderr,
        maxFps: 1,
      }),
    );
    await nextTick();
    await nextTick();
    baseStdout.end();
    baseApp.unmount();
    const baselineTimers = vi.getTimerCount();
    vi.runAllTimers();

    // Test: mount + rerender + end + unmount
    const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
    stdout.columns = 100;
    const msg = shallowRef("Hello");
    const App = defineComponent(() => () => <Text>{msg.value}</Text>);
    const app = createApp(App);
    const stderr = makeFakeWritable({ columns: 80 });
    const { stream: stdin } = makeFakeStdin();
    app.mount(createInternalMountOptions({ stdout, stdin, stderr, maxFps: 1 }));
    await nextTick();
    await nextTick();

    msg.value = "World";
    await nextTick();
    stdout.end();
    app.unmount();

    expect(vi.getTimerCount()).toBe(baselineTimers);
  } finally {
    vi.useRealTimers();
  }
});
