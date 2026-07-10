// Proves the internal Symbol-keyed clock mount option (see
// .agents/docs/clock.md) actually reaches the runtime's timer consumers: the
// commit scheduler's trailing window and the animation scheduler both arm
// their timers through the injected clock, not the global setTimeout.
// Distinctive delays (maxFps=1 → 1000ms window, interval=500) make the
// recorded arms unambiguous.

import { defineComponent, nextTick, shallowRef } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { createApp, Text, useAnimation, type TuiApp } from "@vue-tui/runtime";
import { INTERNAL_CLOCK, realClock, type Clock } from "@vue-tui/runtime/internal";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

function makeRecordingClock() {
  const armedDelays: number[] = [];
  const clock: Clock = {
    now: () => realClock.now(),
    setTimeout: (cb, ms) => {
      armedDelays.push(ms);
      return realClock.setTimeout(cb, ms);
    },
    clearTimeout: (handle) => realClock.clearTimeout(handle),
  };
  return { clock, armedDelays };
}

function mountWithClock(app: TuiApp, clock: Clock) {
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  app.mount({
    stdout,
    stdin,
    stderr,
    maxFps: 1,
    exitOnCtrlC: false,
    [INTERNAL_CLOCK]: clock,
  } as Parameters<TuiApp["mount"]>[0]);
}

describe("INTERNAL_CLOCK mount option", () => {
  test("commit scheduler arms its trailing window through the injected clock", async () => {
    const { clock, armedDelays } = makeRecordingClock();
    const msg = shallowRef("Hello");
    const App = defineComponent(() => () => <Text>{msg.value}</Text>);
    const app = createApp(App);
    mountWithClock(app, clock);
    try {
      await nextTick();
      await new Promise((resolve) => setImmediate(resolve));
      // maxFps=1 → renderThrottleMs=1000; the initial commit arms the trailing
      // window with exactly that delay.
      expect(armedDelays).toContain(1000);
    } finally {
      app.unmount();
    }
  });

  test("animation scheduler arms its tick timer through the injected clock", async () => {
    const { clock, armedDelays } = makeRecordingClock();
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 500 });
      return () => <Text>{frame.value}</Text>;
    });
    const app = createApp(App);
    mountWithClock(app, clock);
    try {
      await nextTick();
      await new Promise((resolve) => setImmediate(resolve));
      // subscribe() schedules the first tick one interval out; the ceil()ed
      // delay is at most the interval and only slightly less (time elapsed
      // between subscribe and schedule).
      expect(armedDelays.some((ms) => ms >= 490 && ms <= 500)).toBe(true);
    } finally {
      app.unmount();
    }
  });
});
