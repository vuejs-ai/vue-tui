// Formerly a *.sequential.test file driven by vi.useFakeTimers (process-global
// timer mocking). Now each app mounts with its own VirtualClock via the
// INTERNAL_CLOCK mount option (see .agents/docs/clock.md): no global mutation,
// so this file runs in the normal parallel pool. Vue's scheduler (nextTick,
// microtasks) stays on the real event loop — clock.advance() awaits a drain
// barrier after every fire, replicating the real-world invariant that the
// microtask queue empties between two timer callbacks.
//
// INTERNAL_CLOCK must be imported from the BUILT `@vue-tui/runtime/internal`
// (same origin as createApp): the symbol is unique per module instantiation,
// so a relative-source import would be a different symbol than the one the
// dist mount() reads.

import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, createApp, Text, type TuiApp } from "@vue-tui/runtime";
import { createVirtualClock, INTERNAL_CLOCK, type Clock } from "@vue-tui/runtime/internal";
import ansiEscapes from "ansi-escapes";
import stripAnsi from "strip-ansi";
import { bsu, esu } from "../../../runtime/src/io/write-synchronized.ts";
import {
  makeFakeStdin,
  makeFakeWritable,
  captureWrites,
  getContentWrites,
} from "./test-streams.ts";

// The symbol option is deliberately absent from the public MountOptions type
// (Ink-faithful), so mount options carrying a clock go through the same
// Parameters cast the @vue-tui/testing helper uses.
type MountArg = Parameters<TuiApp["mount"]>[0];
const withClock = (clock: Clock, options: object): MountArg =>
  ({ ...options, [INTERNAL_CLOCK]: clock }) as MountArg;

test("throttle renders to maxFps", async () => {
  // Port of Ink's "throttle renders to maxFps" — verifies leading+trailing
  // throttle pattern with maxFps=1 (1000ms window).
  const clock = createVirtualClock();
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
    withClock(clock, {
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
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
  await clock.advance(999);
  expect(writes.length).toBe(midWriteCount);

  // Cross the 1000ms boundary: trailing render fires
  await clock.advance(1);
  expect(writes.some((w) => w.includes("World"))).toBe(true);

  app.unmount();
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
test("trailing commit fires at lastCall+wait, re-armed per deferred call", async () => {
  const clock = createVirtualClock();
  const msg = shallowRef("v0");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount(withClock(clock, { stdout, stdin, stderr, exitOnCtrlC: false, maxFps: 1 })); // wait = 1000ms
  await nextTick();
  await nextTick();
  // Let the mount-time throttle window fully expire so "vA" starts idle.
  await clock.advance(2000);

  const has = (s: string) => writes.some((w) => w.includes(s));

  // t0: leading edge — commits synchronously.
  msg.value = "vA";
  await nextTick();
  await nextTick();
  expect(has("vA")).toBe(true);

  // t0+400: deferred call #1 (inside the window).
  await clock.advance(400);
  msg.value = "vB";
  await nextTick();
  await nextTick();

  // t0+800: deferred call #2 — the LAST call; silence afterwards.
  await clock.advance(400);
  msg.value = "vC";
  await nextTick();
  await nextTick();

  // t0+1799: both wrong anchors (t0+1000 window, t0+1400 first-deferred)
  // would have committed by now — Ink's lastCall+wait anchor has not.
  await clock.advance(999);
  expect(has("vC")).toBe(false);

  // t0+1800 = lastCall (t0+800) + wait (1000): the trailing commit fires,
  // and the intermediate "vB" collapsed into it (Ink-identical).
  await clock.advance(1);
  expect(has("vC")).toBe(true);
  expect(has("vB")).toBe(false);

  app.unmount();
});

test("sustained deferred calls hold a ~wait cadence (maxWait edge)", async () => {
  // Re-arming the trailing timer per call must NOT turn the throttle into a
  // debounce that starves forever: es-toolkit's maxWait (= wait) commits
  // synchronously when a call arrives a full window after the first deferral.
  // Shape verified vs real Ink v7.0.4 (audit e29 sustained-burst cadence):
  // calls every 100ms at wait=1000ms — leading at call 1 (t0+100), call 2
  // (t0+200) starts the deferral window, so the calls at t0+1200 (k=12) and
  // t0+2200 (k=22) hit the maxWait edge and commit; the burst tail lands as
  // a trailing commit at lastCall+wait (t0+3500).
  const clock = createVirtualClock();
  const msg = shallowRef("v0.");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount(withClock(clock, { stdout, stdin, stderr, exitOnCtrlC: false, maxFps: 1 })); // wait = 1000ms
  await nextTick();
  await nextTick();
  await clock.advance(2000);

  const has = (s: string) => writes.some((w) => w.includes(s));

  for (let k = 1; k <= 25; k++) {
    await clock.advance(100);
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
  await clock.advance(1000);
  expect(has("v25.")).toBe(true);

  app.unmount();
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

test("no throttled renders after unmount", async () => {
  const clock = createVirtualClock();
  const msg = shallowRef("Foo");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount(withClock(clock, { stdout, stdin, stderr, exitOnCtrlC: false }));
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
  await clock.advance(1000);
  expect(getContentWrites(writes).length).toBe(countAfterUnmount);
});

test("unmount forces pending throttled render", async () => {
  const clock = createVirtualClock();
  const msg = shallowRef("Hello");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount(withClock(clock, { stdout, stdin, stderr, exitOnCtrlC: false, maxFps: 1 }));
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
});

test("unmount cancels pending throttled log writes when stdout is ended", async () => {
  const clock = createVirtualClock();
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

  app.mount(withClock(clock, { stdout, stdin, stderr, exitOnCtrlC: false, maxFps: 1 }));
  await nextTick();
  await nextTick();

  msg.value = "World";
  await nextTick();
  stdout.end();
  app.unmount();
  await clock.advance(1000);

  const hasWriteAfterEndError = writeErrors.some(
    (e) => (e as NodeJS.ErrnoException).code === "ERR_STREAM_WRITE_AFTER_END",
  );
  expect(hasWriteAfterEndError).toBe(false);
});

test("unmount cancels pending throttled render when stdout is ended", async () => {
  // Formerly this test mounted a BASELINE app first, only to measure the
  // ambient global-timer noise vi.getTimerCount() would report. The
  // per-app VirtualClock ledger contains nothing but this app's timers, so
  // the baseline concept is gone: after unmount the ledger must simply be
  // empty.
  const clock = createVirtualClock();
  const { PassThrough } = await import("node:stream");
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  stdout.columns = 100;
  const msg = shallowRef("Hello");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  app.mount(withClock(clock, { stdout, stdin, stderr, exitOnCtrlC: false, maxFps: 1 }));
  await nextTick();
  await nextTick();

  msg.value = "World";
  await nextTick();
  stdout.end();
  app.unmount();

  expect(clock.pendingTimers()).toHaveLength(0);
});

test("resize does not double-clear when a throttled commit is pending", async () => {
  // Regression for issue #26: the resize handler paints synchronously, but if
  // a trailing throttled commit is still pending, that timer fires a second
  // doCommit() right after. Because shouldClearTerminalForFrame clears whenever
  // the previous frame overflowed the viewport, the second commit emits a
  // duplicate clearTerminal. onResize must cancel the pending commit first.
  const clock = createVirtualClock();
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

  app.mount(
    withClock(clock, { stdout, stdin, stderr, exitOnCtrlC: false, interactive: true, maxFps: 1 }),
  );
  await nextTick();
  await nextTick();

  const countClears = () => writes.join("").split(ansiEscapes.clearTerminal).length - 1;

  // Leading commit only: previous height was 0, so no clear yet.
  expect(countClears()).toBe(0);

  // Mutate inside the throttle window so a trailing commit is armed.
  msg.value = "B";
  await nextTick();
  expect(clock.pendingTimers().length).toBeGreaterThanOrEqual(1);

  // Resize while the trailing commit is pending: paints synchronously (1 clear)
  // and must cancel the pending timer so it doesn't paint (and clear) again.
  stdout.emit("resize");
  await clock.advance(1000);

  expect(countClears()).toBe(1);
  expect(stripAnsi(writes.join(""))).toContain("B");

  app.unmount();
});

// Port of Ink render.tsx:1985-2022 ("bsu/esu wraps throttledLog trailing call"):
// a CHANGED frame that lands as a trailing throttled commit must still be wrapped
// in the synchronized-update sequence — bsu before content, esu after. We need a
// real TTY + interactive so shouldSynchronize() is true (CI flips !isInCi off,
// so interactive must be explicit).
test("bsu/esu wraps a trailing throttled content change", async () => {
  const clock = createVirtualClock();
  const msg = shallowRef("Hello");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount(
    withClock(clock, { stdout, stdin, stderr, exitOnCtrlC: false, interactive: true, maxFps: 1 }),
  );
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
  await clock.advance(1000);

  expect(writes.includes(bsu)).toBe(true);
  expect(writes.includes(esu)).toBe(true);
  expect(writes.some((w) => w.includes("World"))).toBe(true);
  // bsu precedes esu.
  expect(writes.indexOf(bsu)).toBeLessThan(writes.indexOf(esu));

  app.unmount();
});

// Port of Ink render.tsx:1945-1980 ("no bsu/esu when output is unchanged"): a
// trailing throttled rerender whose output is IDENTICAL to the last frame must
// emit NEITHER bsu NOR esu — willRender(output) is false, so the synchronized
// wrapper is skipped entirely (Ink emits zero bytes there). We force a re-render
// that produces identical text via a counter ref read in the render fn but not
// reflected in the output, mirroring Ink's rerender(sameElement).
test("no bsu/esu on an unchanged trailing rerender", async () => {
  // tick changes (forcing Vue to re-run the render fn) but the rendered Text
  // is constant, so the produced frame is byte-identical to the prior frame.
  const clock = createVirtualClock();
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

  app.mount(
    withClock(clock, { stdout, stdin, stderr, exitOnCtrlC: false, interactive: true, maxFps: 1 }),
  );
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
  await clock.advance(1000);

  // Output was unchanged → willRender is false → neither barrier is emitted.
  expect(writes.includes(bsu)).toBe(false);
  expect(writes.includes(esu)).toBe(false);

  app.unmount();
});
