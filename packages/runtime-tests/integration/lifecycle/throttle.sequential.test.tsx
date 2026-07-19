// Sequential: uses vi.useFakeTimers, which mutates the process-global timer
// functions. Run concurrently, a sibling test calling useRealTimers() would
// pull the mocked timers out mid-advanceTimersByTime. Tests are it.sequential.

import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { Box, createApp, Text } from "@vue-tui/runtime";
import stripAnsi from "strip-ansi";
import { bsu, esu } from "../../../runtime/dist/internal.mjs";
import type { InternalMountOptions } from "../../../runtime/dist/internal.mjs";
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
      maxFps: 1, // 1 Hz => ~1000ms throttle window
    } as InternalMountOptions);

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

// Audit e29 (verified vs real Ink v7.0.4): Ink's render throttle is
// es-toolkit/compat `throttle(fn, wait, {leading, trailing})`, i.e.
// `debounce(fn, wait, {leading, trailing, maxWait: wait})`, whose trailing
// timer is RE-ARMED on every call — the trailing commit fires at
// lastCall+wait. A window-anchored timer (windowStart+wait) fires a full
// window early; a first-deferred-call anchor (firstDeferred+wait) is also
// wrong, and only this multi-deferred-call shape discriminates it: with
// wait=1000ms and calls at t0 / t0+400 / t0+800, the three anchors predict
// t0+1000 / t0+1400 / t0+1800 respectively.
test.sequential("trailing commit fires at lastCall+wait, re-armed per deferred call", async () => {
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    const msg = shallowRef("v0");
    const App = defineComponent(() => () => <Text>{msg.value}</Text>);
    const app = createApp(App);
    const stdout = makeFakeWritable({ columns: 80 });
    const stderr = makeFakeWritable({ columns: 80 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app.mount({ stdout, stdin, stderr, maxFps: 1 } as InternalMountOptions); // wait = 1000ms
    await nextTick();
    await nextTick();
    // Let the mount-time throttle window fully expire so "vA" starts idle.
    vi.advanceTimersByTime(2000);

    const has = (s: string) => writes.some((w) => w.includes(s));

    // t0: leading edge — commits synchronously.
    msg.value = "vA";
    await nextTick();
    await nextTick();
    expect(has("vA")).toBe(true);

    // t0+400: deferred call #1 (inside the window).
    vi.advanceTimersByTime(400);
    msg.value = "vB";
    await nextTick();
    await nextTick();

    // t0+800: deferred call #2 — the LAST call; silence afterwards.
    vi.advanceTimersByTime(400);
    msg.value = "vC";
    await nextTick();
    await nextTick();

    // t0+1799: both wrong anchors (t0+1000 window, t0+1400 first-deferred)
    // would have committed by now — Ink's lastCall+wait anchor has not.
    vi.advanceTimersByTime(999);
    expect(has("vC")).toBe(false);

    // t0+1800 = lastCall (t0+800) + wait (1000): the trailing commit fires,
    // and the intermediate "vB" collapsed into it (Ink-identical).
    vi.advanceTimersByTime(1);
    expect(has("vC")).toBe(true);
    expect(has("vB")).toBe(false);

    app.unmount();
  } finally {
    vi.useRealTimers();
  }
});

test.sequential("sustained deferred calls hold a ~wait cadence (maxWait edge)", async () => {
  // Re-arming the trailing timer per call must NOT turn the throttle into a
  // debounce that starves forever: es-toolkit's maxWait (= wait) commits
  // synchronously when a call arrives a full window after the first deferral.
  // Shape verified vs real Ink v7.0.4 (audit e29 sustained-burst cadence):
  // calls every 100ms at wait=1000ms — leading at call 1 (t0+100), call 2
  // (t0+200) starts the deferral window, so the calls at t0+1200 (k=12) and
  // t0+2200 (k=22) hit the maxWait edge and commit; the burst tail lands as
  // a trailing commit at lastCall+wait (t0+3500).
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    const msg = shallowRef("v0.");
    const App = defineComponent(() => () => <Text>{msg.value}</Text>);
    const app = createApp(App);
    const stdout = makeFakeWritable({ columns: 80 });
    const stderr = makeFakeWritable({ columns: 80 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app.mount({ stdout, stdin, stderr, maxFps: 1 } as InternalMountOptions); // wait = 1000ms
    await nextTick();
    await nextTick();
    vi.advanceTimersByTime(2000);

    const has = (s: string) => writes.some((w) => w.includes(s));

    for (let k = 1; k <= 25; k++) {
      vi.advanceTimersByTime(100);
      msg.value = `v${k}.`;
      await nextTick();
      await nextTick();
    }

    expect(has("v1.")).toBe(true); // leading
    expect(has("v12.")).toBe(true); // maxWait edge, one wait after first deferral
    expect(has("v22.")).toBe(true); // next maxWait edge
    // The burst tail (last call t0+2500) is still pending...
    expect(has("v25.")).toBe(false);
    // ...and lands at lastCall+wait.
    vi.advanceTimersByTime(1000);
    expect(has("v25.")).toBe(true);

    app.unmount();
  } finally {
    vi.useRealTimers();
  }
});

test.sequential("unthrottled scheduler commits every mutation", async () => {
  // Counterpart to the throttle test: maxFps: 0 bypasses throttling and
  // commits synchronously.
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
    maxFps: 0,
  } as InternalMountOptions);

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
  // Screen-reader presentation uses immediate commits so every frame is
  // available without delay for assistive technology.
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
    presentation: "screen-reader",
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

    app.mount({ stdout, stdin, stderr, maxFps: 1 } as InternalMountOptions);
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

    app.mount({ stdout, stdin, stderr, maxFps: 1 } as InternalMountOptions);
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
      maxFps: 1,
    } as InternalMountOptions);
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
    app.mount({ stdout, stdin, stderr, maxFps: 1 } as InternalMountOptions);
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

test.sequential("resize consumes a pending throttled commit without a second paint", async () => {
  // Regression for issue #26: resize bypasses the throttle after Vue has
  // refreshed the host tree. Any trailing timer that represented the same
  // pending tree must be cancelled, or it repaints a second time afterwards.
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    const msg = shallowRef("A");
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>line1</Text>
        <Text>{msg.value}</Text>
      </Box>
    ));
    const app = createApp(App);
    const stdout = makeFakeWritable({ columns: 80, rows: 2 });
    const stderr = makeFakeWritable({ columns: 80, rows: 2 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app.mount({
      stdout,
      stdin,
      stderr,
      liveUpdates: true,
      maxFps: 1,
    } as InternalMountOptions);
    await nextTick();
    await nextTick();

    // Mutate inside the throttle window so a trailing commit is armed.
    msg.value = "B";
    await nextTick();
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1);

    const beforeResize = writes.length;
    // A same-size resize event keeps the current physical baseline addressable,
    // but still consumes the pending tree at the resize render barrier.
    stdout.emit("resize");
    await app.waitUntilRenderFlush();
    const afterResize = writes.length;
    expect(stripAnsi(writes.slice(beforeResize).join(""))).toContain("B");

    vi.advanceTimersByTime(1000);

    expect(writes).toHaveLength(afterResize);
    expect(vi.getTimerCount()).toBe(0);
    expect(writes.join("")).not.toContain("\x1b[2J");
    expect(writes.join("")).not.toContain("\x1b[3J");
    expect(writes.join("")).not.toContain("\x1b[H");

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

    app.mount({
      stdout,
      stdin,
      stderr,
      liveUpdates: true,
      maxFps: 1,
    } as InternalMountOptions);
    await nextTick();
    await nextTick();

    // Leading call wrote bsu + content + esu.
    expect(writes.join("")).toContain(bsu);
    expect(writes.join("")).toContain(esu);

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

    const transaction = writes.join("");
    expect(transaction).toContain(bsu);
    expect(transaction).toContain(esu);
    expect(transaction).toContain("World");
    expect(transaction.indexOf(bsu)).toBeLessThan(transaction.indexOf("World"));
    expect(transaction.indexOf("World")).toBeLessThan(transaction.indexOf(esu));

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

    app.mount({
      stdout,
      stdin,
      stderr,
      liveUpdates: true,
      maxFps: 1,
    } as InternalMountOptions);
    await nextTick();
    await nextTick();

    // Initial (leading) render emitted bsu (proves synchronization is active).
    expect(writes.join("")).toContain(bsu);

    // Force an identical-output rerender inside the throttle window, then cross
    // the window so the trailing commit runs.
    writes.length = 0;
    tick.value++;
    await nextTick();
    await nextTick();
    vi.advanceTimersByTime(1000);

    // Output was unchanged → willRender is false → neither barrier is emitted.
    expect(writes.join("")).not.toContain(bsu);
    expect(writes.join("")).not.toContain(esu);

    app.unmount();
  } finally {
    vi.useRealTimers();
  }
});
