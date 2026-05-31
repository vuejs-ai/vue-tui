// Sequential: uses vi.useFakeTimers, which mutates the process-global timer
// functions. Run concurrently, a sibling test calling useRealTimers() would
// pull the mocked timers out mid-advanceTimersByTime. Tests are it.sequential.

import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { Box, createApp, Text } from "@vue-tui/runtime";
import ansiEscapes from "ansi-escapes";
import stripAnsi from "strip-ansi";
import { bsu, esu } from "../../../runtime/src/io/write-synchronized.ts";
import {
  makeFakeStdin,
  makeFakeWritable,
  captureWrites,
  getContentWrites,
} from "./test-streams.ts";

// Fake timer options: only fake setTimeout/clearTimeout/Date so that
// Vue's internal scheduler (nextTick, queueMicrotask, setImmediate) still
// runs on real clocks. This matches the pattern in use-animation.test.tsx.
const FAKE_TIMER_OPTS = {
  shouldAdvanceTime: false,
  toFake: ["setTimeout", "clearTimeout", "Date"] as ("setTimeout" | "clearTimeout" | "Date")[],
};

test.sequential("throttle renders to maxFps", async () => {
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

test.sequential("immediate scheduler in debug mode commits every mutation", async () => {
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

test.sequential("screen reader mode bypasses throttle (immediate commits)", async () => {
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

    app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });
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

    app.mount({ stdout, stdin, stderr, exitOnCtrlC: false, maxFps: 1 });
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

    app.mount({ stdout, stdin, stderr, exitOnCtrlC: false, maxFps: 1 });
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
    baseApp.mount({
      stdout: baseStdout,
      stdin: baseStdin,
      stderr: baseStderr,
      exitOnCtrlC: false,
      maxFps: 1,
    });
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
    app.mount({ stdout, stdin, stderr, exitOnCtrlC: false, maxFps: 1 });
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

test.sequential("resize does not double-clear when a throttled commit is pending", async () => {
  // Regression for issue #26: the resize handler paints synchronously, but if
  // a trailing throttled commit is still pending, that timer fires a second
  // doCommit() right after. Because shouldClearTerminalForFrame clears whenever
  // the previous frame overflowed the viewport, the second commit emits a
  // duplicate clearTerminal. onResize must cancel the pending commit first.
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    const msg = shallowRef("A");
    // Three rows of content into a 2-row viewport => the frame overflows, so
    // every commit after the first takes the clearTerminal branch.
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>line1</Text>
        <Text>line2</Text>
        <Text>{msg.value}</Text>
      </Box>
    ));
    const app = createApp(App);
    const stdout = makeFakeWritable({ columns: 80, rows: 2 });
    const stderr = makeFakeWritable({ columns: 80, rows: 2 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app.mount({ stdout, stdin, stderr, exitOnCtrlC: false, interactive: true, maxFps: 1 });
    await nextTick();
    await nextTick();

    const countClears = () => writes.join("").split(ansiEscapes.clearTerminal).length - 1;

    // Leading commit only: previous height was 0, so no clear yet.
    expect(countClears()).toBe(0);

    // Mutate inside the throttle window so a trailing commit is armed.
    msg.value = "B";
    await nextTick();
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1);

    // Resize while the trailing commit is pending: paints synchronously (1 clear)
    // and must cancel the pending timer so it doesn't paint (and clear) again.
    stdout.emit("resize");
    vi.advanceTimersByTime(1000);

    expect(countClears()).toBe(1);
    expect(stripAnsi(writes.join(""))).toContain("B");

    app.unmount();
  } finally {
    vi.useRealTimers();
  }
});

// Port of Ink render.tsx:1985-2022 ("bsu/esu wraps throttledLog trailing call"):
// a CHANGED frame that lands as a trailing throttled commit must still be wrapped
// in the synchronized-update sequence — bsu before content, esu after. We need a
// real TTY + interactive so shouldSynchronize() is true (CI flips !isInCi off,
// so interactive must be explicit).
test.sequential("bsu/esu wraps a trailing throttled content change", async () => {
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    const msg = shallowRef("Hello");
    const App = defineComponent(() => () => <Text>{msg.value}</Text>);
    const app = createApp(App);
    const stdout = makeFakeWritable({ columns: 80 });
    const stderr = makeFakeWritable({ columns: 80 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app.mount({ stdout, stdin, stderr, exitOnCtrlC: false, interactive: true, maxFps: 1 });
    await nextTick();
    await nextTick();

    // Leading call wrote bsu + content + esu.
    expect(writes.includes(bsu)).toBe(true);
    expect(writes.includes(esu)).toBe(true);

    // Mutate inside the throttle window — the trailing commit is deferred.
    writes.length = 0;
    msg.value = "World";
    await nextTick();
    await nextTick();
    // Nothing written yet (throttled): no "World", no barriers.
    expect(writes.some((w) => w.includes("World"))).toBe(false);

    // Cross the window: the trailing commit fires and must be bsu/esu-wrapped.
    writes.length = 0;
    vi.advanceTimersByTime(1000);

    expect(writes.includes(bsu)).toBe(true);
    expect(writes.includes(esu)).toBe(true);
    expect(writes.some((w) => w.includes("World"))).toBe(true);
    // bsu precedes esu.
    expect(writes.indexOf(bsu)).toBeLessThan(writes.indexOf(esu));

    app.unmount();
  } finally {
    vi.useRealTimers();
  }
});

// Port of Ink render.tsx:1945-1980 ("no bsu/esu when output is unchanged"): a
// trailing throttled rerender whose output is IDENTICAL to the last frame must
// emit NEITHER bsu NOR esu — willRender(output) is false, so the synchronized
// wrapper is skipped entirely (Ink emits zero bytes there). We force a re-render
// that produces identical text via a counter ref read in the render fn but not
// reflected in the output, mirroring Ink's rerender(sameElement).
test.sequential("no bsu/esu on an unchanged trailing rerender", async () => {
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    // tick changes (forcing Vue to re-run the render fn) but the rendered Text
    // is constant, so the produced frame is byte-identical to the prior frame.
    const tick = shallowRef(0);
    const App = defineComponent(() => () => {
      void tick.value;
      return <Text>Hello</Text>;
    });
    const app = createApp(App);
    const stdout = makeFakeWritable({ columns: 80 });
    const stderr = makeFakeWritable({ columns: 80 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app.mount({ stdout, stdin, stderr, exitOnCtrlC: false, interactive: true, maxFps: 1 });
    await nextTick();
    await nextTick();

    // Initial (leading) render emitted bsu (proves synchronization is active).
    expect(writes.includes(bsu)).toBe(true);

    // Force an identical-output rerender inside the throttle window, then cross
    // the window so the trailing commit runs.
    writes.length = 0;
    tick.value++;
    await nextTick();
    await nextTick();
    vi.advanceTimersByTime(1000);

    // Output was unchanged → willRender is false → neither barrier is emitted.
    expect(writes.includes(bsu)).toBe(false);
    expect(writes.includes(esu)).toBe(false);

    app.unmount();
  } finally {
    vi.useRealTimers();
  }
});
