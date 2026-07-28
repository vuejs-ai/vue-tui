// Sequential: uses vi.useFakeTimers, which mutates process-global timer functions.
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { createInternalMountOptions } from "../../../../../packages/runtime/dist/internal.mjs";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "../test-streams.ts";
import { FAKE_TIMER_OPTS } from "./harness.ts";

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

    app.mount(
      createInternalMountOptions({
        stdout,
        stdin,
        stderr,
        maxFps: 1, // 1 Hz => ~1000ms throttle window
      }),
    );

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

    app.mount(createInternalMountOptions({ stdout, stdin, stderr, maxFps: 1 })); // wait = 1000ms
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

    app.mount(createInternalMountOptions({ stdout, stdin, stderr, maxFps: 1 })); // wait = 1000ms
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

  app.mount(
    createInternalMountOptions({
      stdout,
      stdin,
      stderr,
      maxFps: 0,
    }),
  );

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
