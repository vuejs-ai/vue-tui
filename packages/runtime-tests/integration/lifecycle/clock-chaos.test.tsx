// The determinism watchdog (see .agents/docs/clock.md): one scripted journey
// through throttled commits, an escape-hold delivery, and trailing windows,
// run twice — the second time with real wall-clock sleeps and allocation
// churn injected between steps. The captured stdout write sequences must be
// byte-identical. If any runtime path regains a wall-clock dependency, the
// injected jitter eventually pushes a decision across a threshold and this
// test fails — it is a resident leak detector, not a one-time proof.
// (Pattern borrowed from PocketJS's chaos-mode sim runs.)

import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useInput, type TuiApp } from "@vue-tui/runtime";
import { createVirtualClock, INTERNAL_CLOCK } from "@vue-tui/runtime/internal";
import { makeFakeStdin, makeFakeWritable, captureWrites } from "./test-streams.ts";

const drain = () => new Promise<void>((resolve) => setImmediate(resolve));
const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function runJourney(chaos: boolean): Promise<string[]> {
  const clock = createVirtualClock();
  const msg = shallowRef("start");
  const App = defineComponent(() => {
    useInput((_input, key) => {
      if (key.escape) msg.value = "escaped";
    });
    return () => <Text>{msg.value}</Text>;
  });
  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  let garbage: unknown[] = [];
  // Real nondeterminism, injected on purpose: variable wall-clock delay and
  // allocation pressure between steps. None of it may reach the writes.
  const jitter = async () => {
    if (!chaos) return;
    garbage.push(Array.from({ length: 1024 }, () => garbage.length));
    if (garbage.length > 64) garbage = [];
    await realSleep(Math.random() * 5);
  };

  app.mount({
    stdout,
    stdin,
    stderr,
    exitOnCtrlC: false,
    interactive: true,
    maxFps: 1, // 1000ms window — every commit decision rides the clock
    [INTERNAL_CLOCK]: clock,
  } as Parameters<TuiApp["mount"]>[0]);

  await nextTick();
  await nextTick();
  await jitter();
  await clock.advance(2000); // mount-time window fully expires

  msg.value = "v1"; // leading commit
  await nextTick();
  await nextTick();
  await jitter();

  await clock.advance(400);
  msg.value = "v2"; // deferred into the window
  await nextTick();
  await nextTick();
  await jitter();

  await clock.advance(1400); // trailing commit for v2 fires

  stdin.emit("data", "\x1b"); // bare escape — held by the pending flush
  await drain();
  await jitter();
  await clock.advance(20); // escape delivered → "escaped" render scheduled
  await nextTick();
  await nextTick();
  await clock.advance(2000); // flush any trailing window

  app.unmount();
  return writes;
}

test("wall clock is not an input: a chaos run produces byte-identical writes", async () => {
  const clean = await runJourney(false);
  const chaotic = await runJourney(true);
  expect(chaotic).toEqual(clean);
  // Sanity: the journey actually exercised the interesting states.
  const all = clean.join("");
  expect(all).toContain("v1");
  expect(all).toContain("escaped");
});
