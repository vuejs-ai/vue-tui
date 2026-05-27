import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

// Fake timer options: only fake setTimeout/clearTimeout/Date so that
// Vue's internal scheduler (nextTick, queueMicrotask, setImmediate) still
// runs on real clocks. This matches the pattern in use-animation.test.tsx.
const FAKE_TIMER_OPTS = {
  shouldAdvanceTime: false,
  toFake: ["setTimeout", "clearTimeout", "Date"] as ("setTimeout" | "clearTimeout" | "Date")[],
};

/** Collect raw write calls from a fake writable. */
function captureWrites(stdout: NodeJS.WriteStream): string[] {
  const writes: string[] = [];
  const original = stdout.write.bind(stdout);
  stdout.write = ((...args: unknown[]) => {
    writes.push(String(args[0]));
    return (original as Function)(...args);
  }) as NodeJS.WriteStream["write"];
  return writes;
}

test("throttle renders to maxFps", async () => {
  // Port of Ink's "throttle renders to maxFps" — verifies leading+trailing
  // throttle pattern with maxFps=1 (1000ms window).
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    const msg = shallowRef("Hello");

    const App = defineComponent(() => {
      return () => <Text>{msg.value}</Text>;
    });

    const app = createApp(App);
    const stdout = makeFakeWritable({ columns: 80 });
    const stderr = makeFakeWritable({ columns: 80 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app.mount({
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      maxFps: 1, // 1 Hz => ~1000ms throttle window
    });

    // Flush Vue scheduler so the initial commit fires (leading edge)
    await nextTick();
    await nextTick();

    const initialWriteCount = writes.length;
    expect(initialWriteCount).toBeGreaterThanOrEqual(1);
    expect(writes.some((w) => w.includes("Hello"))).toBe(true);

    // Trigger a rerender inside the throttle window
    msg.value = "World";
    await nextTick();
    await nextTick();

    // Throttling should have held — no new writes yet
    const midWriteCount = writes.length;
    expect(midWriteCount).toBe(initialWriteCount);

    // Advance 999ms: still within window, no trailing call yet
    vi.advanceTimersByTime(999);
    expect(writes.length).toBe(midWriteCount);

    // Cross the 1000ms boundary: trailing render fires
    vi.advanceTimersByTime(1);
    expect(writes.some((w) => w.includes("World"))).toBe(true);

    app.unmount();
  } finally {
    vi.useRealTimers();
  }
});

test("immediate scheduler in debug mode commits every mutation", async () => {
  // Counterpart to the throttle test: in debug mode (used by the testing
  // helper), the scheduler bypasses throttling and commits synchronously.
  // This verifies the immediate path in createCommitScheduler.
  const msg = shallowRef("A");

  const App = defineComponent(() => {
    return () => <Text>{msg.value}</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({
    stdout,
    stdin,
    stderr,
    debug: true,
    exitOnCtrlC: false,
  });

  await nextTick();
  await nextTick();
  expect(writes.some((w) => w.includes("A"))).toBe(true);

  msg.value = "B";
  await nextTick();
  await nextTick();
  expect(writes.some((w) => w.includes("B"))).toBe(true);

  msg.value = "C";
  await nextTick();
  await nextTick();
  expect(writes.some((w) => w.includes("C"))).toBe(true);

  app.unmount();
});

test("screen reader mode bypasses throttle (immediate commits)", async () => {
  // Port of Ink's screen reader behavior: isScreenReaderEnabled causes
  // the scheduler to use immediate mode, ensuring every frame is flushed
  // without delay for assistive technology.
  const msg = shallowRef("Hello");

  const App = defineComponent(() => {
    return () => <Text>{msg.value}</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({
    stdout,
    stdin,
    stderr,
    exitOnCtrlC: false,
    isScreenReaderEnabled: true,
  });

  await nextTick();
  await nextTick();
  expect(writes.some((w) => w.includes("Hello"))).toBe(true);

  // Even rapid mutations should commit immediately (no throttle)
  msg.value = "World";
  await nextTick();
  await nextTick();
  expect(writes.some((w) => w.includes("World"))).toBe(true);

  app.unmount();
});
