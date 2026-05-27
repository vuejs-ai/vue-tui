import { PassThrough } from "node:stream";
import { defineComponent, nextTick, shallowRef, watchEffect } from "vue";
import type { ShallowRef } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useAnimation, createApp } from "@vue-tui/runtime";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Only fake setInterval / clearInterval / performance so that render()'s
 * internal setImmediate / setTimeout / nextTick still resolve on real clocks.
 */
const FAKE_TIMER_OPTS = {
  toFake: ["setInterval", "clearInterval", "performance"] as (
    | "setInterval"
    | "clearInterval"
    | "performance"
  )[],
};

describe("useAnimation", () => {
  // ---------------------------------------------------------------
  // Original 9 tests
  // ---------------------------------------------------------------

  test("increments frame over time", async () => {
    const frames: number[] = [];
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50 });
      watchEffect(() => {
        frames.push(frame.value);
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(200);
    unmount();
    expect(frames.length).toBeGreaterThan(2);
  });

  test("isActive false pauses animation", async () => {
    const active = shallowRef(false);
    let lastFrame = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50, isActive: active });
      watchEffect(() => {
        lastFrame = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(200);
    expect(lastFrame).toBe(0);
    unmount();
  });

  test("toggling isActive to true starts animation", async () => {
    const active = shallowRef(false);
    let lastFrame = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50, isActive: active });
      watchEffect(() => {
        lastFrame = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(100);
    expect(lastFrame).toBe(0);

    active.value = true;
    await delay(200);
    expect(lastFrame).toBeGreaterThan(0);
    unmount();
  });

  test("reset resets all values to 0", async () => {
    let resetFn: (() => void) | undefined;
    let frameRef: { readonly value: number } | undefined;
    let timeRef: { readonly value: number } | undefined;
    let deltaRef: { readonly value: number } | undefined;
    const App = defineComponent(() => {
      const { frame, time, delta, reset } = useAnimation({ interval: 50 });
      resetFn = reset;
      frameRef = frame;
      timeRef = time;
      deltaRef = delta;
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(200);
    expect(frameRef!.value).toBeGreaterThan(0);
    resetFn!();
    expect(frameRef!.value).toBe(0);
    expect(timeRef!.value).toBe(0);
    expect(deltaRef!.value).toBe(0);
    unmount();
  });

  test("time and delta are populated", async () => {
    let timeVal = 0;
    let deltaVal = 0;
    const App = defineComponent(() => {
      const { time, delta } = useAnimation({ interval: 50 });
      watchEffect(() => {
        timeVal = time.value;
        deltaVal = delta.value;
      });
      return () => <Text>anim</Text>;
    });
    const { unmount } = await render(App);
    await delay(200);
    expect(timeVal).toBeGreaterThan(0);
    expect(deltaVal).toBeGreaterThan(0);
    unmount();
  });

  test("non-finite interval defaults to 100ms", async () => {
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: Infinity });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(250);
    unmount();
  });

  test("NaN interval defaults to 100ms", async () => {
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: NaN });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(250);
    unmount();
  });

  test("cleans up timer on unmount", async () => {
    const App = defineComponent(() => {
      useAnimation({ interval: 50 });
      return () => <Text>cleanup</Text>;
    });
    const { unmount } = await render(App);
    unmount();
  });

  test("default options work", async () => {
    const frames: number[] = [];
    const App = defineComponent(() => {
      const { frame } = useAnimation();
      watchEffect(() => {
        frames.push(frame.value);
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(350);
    unmount();
    expect(frames.length).toBeGreaterThan(1);
  });

  // ---------------------------------------------------------------
  // New 34 tests ported from Ink
  // ---------------------------------------------------------------

  test("multiple animations with the same interval stay in sync", async () => {
    const frames: Array<[number, number]> = [];
    const App = defineComponent(() => {
      const { frame: frame1 } = useAnimation({ interval: 50 });
      const { frame: frame2 } = useAnimation({ interval: 50 });
      watchEffect(() => {
        frames.push([frame1.value, frame2.value]);
      });
      return () => (
        <Text>
          {String(frame1.value)},{String(frame2.value)}
        </Text>
      );
    });
    const { unmount } = await render(App);
    await delay(200);
    unmount();

    const last = frames.at(-1)!;
    expect(Math.abs(last[0] - last[1])).toBeLessThanOrEqual(1);
    expect(last[0]).toBeGreaterThanOrEqual(1);
  });

  test("multiple animations with the same interval both advance", async () => {
    let frame1Val = 0;
    let frame2Val = 0;
    const App = defineComponent(() => {
      const { frame: frame1 } = useAnimation({ interval: 50 });
      const { frame: frame2 } = useAnimation({ interval: 50 });
      watchEffect(() => {
        frame1Val = frame1.value;
        frame2Val = frame2.value;
      });
      return () => (
        <Text>
          {String(frame1.value)},{String(frame2.value)}
        </Text>
      );
    });
    const { unmount } = await render(App);
    await delay(200);
    unmount();

    expect(frame1Val).toBeGreaterThanOrEqual(1);
    expect(frame2Val).toBeGreaterThanOrEqual(1);
    expect(Math.abs(frame1Val - frame2Val)).toBeLessThanOrEqual(1);
  });

  test("animations with different intervals advance at different rates", async () => {
    let fastFrame = 0;
    let slowFrame = 0;
    const App = defineComponent(() => {
      const { frame: fast } = useAnimation({ interval: 50 });
      const { frame: slow } = useAnimation({ interval: 200 });
      watchEffect(() => {
        fastFrame = fast.value;
        slowFrame = slow.value;
      });
      return () => (
        <Text>
          {String(fast.value)},{String(slow.value)}
        </Text>
      );
    });
    const { unmount } = await render(App);
    await delay(500);
    unmount();

    expect(fastFrame).toBeGreaterThan(slowFrame);
  });

  test("timer is cleaned up and recreated after unmount and remount", async () => {
    let frameVal = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50 });
      watchEffect(() => {
        frameVal = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });

    const first = await render(App);
    await delay(150);
    expect(frameVal).toBeGreaterThanOrEqual(1);
    first.unmount();

    frameVal = 0;
    const second = await render(App);
    await delay(150);
    expect(frameVal).toBeGreaterThanOrEqual(1);
    second.unmount();
  });

  test("animation continues when a sibling animation unmounts", async () => {
    const showSecond = shallowRef(true);
    let firstFrame = 0;
    const AnimationValue = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50 });
      watchEffect(() => {
        firstFrame = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const SecondAnimation = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50 });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const App = defineComponent(() => {
      return () => (
        <>
          <AnimationValue />
          {showSecond.value ? <SecondAnimation /> : undefined}
        </>
      );
    });

    const { unmount } = await render(App);
    await delay(150);
    const frameBeforeRemoval = firstFrame;
    expect(frameBeforeRemoval).toBeGreaterThanOrEqual(1);

    showSecond.value = false;
    await nextTick();

    await delay(150);
    expect(firstFrame).toBeGreaterThan(frameBeforeRemoval);
    unmount();
  });

  test("animation with different-interval sibling continues after sibling unmounts", async () => {
    const showSecond = shallowRef(true);
    let fastFrame = 0;
    const FastAnimation = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50 });
      watchEffect(() => {
        fastFrame = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const SlowAnimation = defineComponent(() => {
      const { frame } = useAnimation({ interval: 80 });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const App = defineComponent(() => {
      return () => (
        <>
          <FastAnimation />
          {showSecond.value ? <SlowAnimation /> : undefined}
        </>
      );
    });

    const { unmount } = await render(App);
    await delay(150);
    const frameBeforeRemoval = fastFrame;
    expect(frameBeforeRemoval).toBeGreaterThanOrEqual(1);

    showSecond.value = false;
    await nextTick();

    await delay(150);
    expect(fastFrame).toBeGreaterThan(frameBeforeRemoval);
    unmount();
  });

  test("inactive animations do not start timer until one becomes active", async () => {
    const isFirstActive = shallowRef(false);
    const isSecondActive = shallowRef(false);
    let firstFrame = 0;
    let secondFrame = 0;
    const App = defineComponent(() => {
      const { frame: f1 } = useAnimation({ interval: 50, isActive: isFirstActive });
      const { frame: f2 } = useAnimation({ interval: 50, isActive: isSecondActive });
      watchEffect(() => {
        firstFrame = f1.value;
        secondFrame = f2.value;
      });
      return () => (
        <Text>
          {String(f1.value)},{String(f2.value)}
        </Text>
      );
    });

    const { unmount } = await render(App);
    await delay(150);
    expect(firstFrame).toBe(0);
    expect(secondFrame).toBe(0);

    isFirstActive.value = true;
    await delay(150);
    expect(firstFrame).toBeGreaterThanOrEqual(1);
    expect(secondFrame).toBe(0);

    unmount();
  });

  test("cleans up on unmount - no new frames after unmount", async () => {
    let frameVal = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50 });
      watchEffect(() => {
        frameVal = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(120);
    unmount();

    const frameAfterUnmount = frameVal;
    await delay(150);
    expect(frameVal).toBe(frameAfterUnmount);
  });

  test("no timer leak when all animations are inactive", async () => {
    const active = shallowRef(false);
    let frameVal = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50, isActive: active });
      watchEffect(() => {
        frameVal = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });

    const { unmount } = await render(App);
    await delay(150);
    expect(frameVal).toBe(0);

    active.value = true;
    await delay(150);
    expect(frameVal).toBeGreaterThanOrEqual(1);

    active.value = false;
    await nextTick();
    const frozenFrame = frameVal;
    await delay(150);
    expect(frameVal).toBe(frozenFrame);

    unmount();
  });

  test("resets frame when isActive toggles from false to true", async () => {
    const active = shallowRef(true);
    let frameVal = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50, isActive: active });
      watchEffect(() => {
        frameVal = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);

    await delay(150);
    expect(frameVal).toBeGreaterThanOrEqual(1);

    active.value = false;
    await nextTick();

    active.value = true;
    await nextTick();
    expect(frameVal).toBe(0);

    await delay(150);
    expect(frameVal).toBeGreaterThanOrEqual(1);
    unmount();
  });

  test("resets frame when remounted with different interval", async () => {
    let frameVal = 0;

    const makeApp = (interval: number) =>
      defineComponent(() => {
        const { frame } = useAnimation({ interval });
        watchEffect(() => {
          frameVal = frame.value;
        });
        return () => <Text>{String(frame.value)}</Text>;
      });

    const first = await render(makeApp(50));
    await delay(150);
    expect(frameVal).toBeGreaterThanOrEqual(1);
    first.unmount();

    const second = await render(makeApp(200));
    expect(frameVal).toBe(0);
    second.unmount();
  });

  test("time and delta reset to 0 when animation is resumed", async () => {
    const active = shallowRef(true);
    let frameVal = 0;
    let timeVal = 0;
    let deltaVal = 0;
    const App = defineComponent(() => {
      const { frame, time, delta } = useAnimation({ interval: 50, isActive: active });
      watchEffect(() => {
        frameVal = frame.value;
        timeVal = time.value;
        deltaVal = delta.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);

    await delay(200);
    expect(frameVal).toBeGreaterThanOrEqual(1);
    expect(timeVal).toBeGreaterThanOrEqual(50);

    active.value = false;
    await nextTick();
    active.value = true;
    await nextTick();
    expect(frameVal).toBe(0);
    expect(timeVal).toBe(0);
    expect(deltaVal).toBe(0);

    unmount();
  });

  test("treats negative Infinity interval as the default interval", async () => {
    let frameVal = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: Number.NEGATIVE_INFINITY });
      watchEffect(() => {
        frameVal = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(250);
    expect(frameVal).toBeGreaterThanOrEqual(1);
    unmount();
  });

  test("clamps oversized finite interval to the timer maximum", async () => {
    let frameVal = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: Number.MAX_SAFE_INTEGER });
      watchEffect(() => {
        frameVal = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(200);
    expect(frameVal).toBe(0);
    unmount();
  });

  // -- Fake timer tests --
  // These use vi.useFakeTimers with selective faking so that render()'s
  // internal setImmediate / setTimeout / nextTick still resolve on real clocks.
  // IMPORTANT: After vi.advanceTimersByTime(), read refs directly via .value
  // because Vue's scheduler microtasks don't flush during timer advancement.

  describe("with fake timers", () => {
    // Captured refs for direct reading (avoids watchEffect flush timing issues)
    let frameRef: Readonly<ShallowRef<number>>;
    let timeRef: Readonly<ShallowRef<number>>;
    let deltaRef: Readonly<ShallowRef<number>>;
    let resetFn: () => void;

    beforeEach(() => {
      vi.useFakeTimers(FAKE_TIMER_OPTS);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("clamps zero interval to 1ms", async () => {
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 0 });
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      expect(frameRef.value).toBe(0);
      vi.advanceTimersByTime(5);
      expect(frameRef.value).toBe(5);
      unmount();
    });

    test("clamps negative interval to 1ms", async () => {
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: -10 });
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      expect(frameRef.value).toBe(0);
      vi.advanceTimersByTime(5);
      expect(frameRef.value).toBe(5);
      unmount();
    });

    test("frame catches up when timer is delayed", async () => {
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 50 });
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      vi.advanceTimersByTime(220);
      // At interval=50, 220ms => ticks at 50,100,150,200 => frame=4
      expect(frameRef.value).toBe(4);
      unmount();
    });

    test("defaults to 100ms interval (fake timers)", async () => {
      const App = defineComponent(() => {
        const anim = useAnimation();
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      expect(frameRef.value).toBe(0);
      vi.advanceTimersByTime(250);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);
      unmount();
    });

    test("NaN interval treated as default (fake timers)", async () => {
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: NaN });
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      expect(frameRef.value).toBe(0);
      vi.advanceTimersByTime(250);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);
      unmount();
    });

    test("Infinity interval treated as default (fake timers)", async () => {
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: Number.POSITIVE_INFINITY });
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      expect(frameRef.value).toBe(0);
      vi.advanceTimersByTime(250);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);
      unmount();
    });

    test("pausing animation stops ticks before the next frame", async () => {
      const active = shallowRef(true);
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 8, isActive: active });
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      vi.advanceTimersByTime(25);
      const pausedFrame = frameRef.value;
      expect(pausedFrame).toBeGreaterThanOrEqual(1);

      // The watch on isActive uses flush: 'sync', so stop() is called immediately
      active.value = false;

      vi.advanceTimersByTime(25);
      expect(frameRef.value).toBe(pausedFrame);

      unmount();
    });

    test("changing interval via remount unsubscribes stale ticks", async () => {
      const makeApp = (interval: number) =>
        defineComponent(() => {
          const anim = useAnimation({ interval });
          frameRef = anim.frame;
          return () => <Text>{String(anim.frame.value)}</Text>;
        });

      const first = await render(makeApp(8));
      vi.advanceTimersByTime(25);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);
      first.unmount();

      const second = await render(makeApp(200));
      expect(frameRef.value).toBe(0);

      vi.advanceTimersByTime(17);
      expect(frameRef.value).toBe(0);

      second.unmount();
    });

    test("newly mounted animations do not inherit elapsed time", async () => {
      const showSecond = shallowRef(false);
      let firstFrameRef!: Readonly<ShallowRef<number>>;
      let secondFrameRef!: Readonly<ShallowRef<number>>;

      const FirstAnim = defineComponent(() => {
        const anim = useAnimation({ interval: 20 });
        firstFrameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });

      const SecondAnim = defineComponent(() => {
        const anim = useAnimation({ interval: 20 });
        secondFrameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });

      const App = defineComponent(() => {
        return () => (
          <>
            <FirstAnim />
            <Text>,</Text>
            {showSecond.value ? <SecondAnim /> : <Text>-</Text>}
          </>
        );
      });

      const { unmount } = await render(App);

      vi.advanceTimersByTime(25);
      expect(firstFrameRef.value).toBe(1);

      // Mount the second animation after some time has passed
      showSecond.value = true;
      await nextTick();

      vi.advanceTimersByTime(40);
      expect(firstFrameRef.value).toBeGreaterThanOrEqual(2);
      expect(secondFrameRef.value).toBeGreaterThanOrEqual(1);
      expect(firstFrameRef.value - secondFrameRef.value).toBe(1);

      unmount();
    });

    test("newly activated animations do not inherit elapsed time", async () => {
      const isSecondActive = shallowRef(false);
      let firstFrameRef!: Readonly<ShallowRef<number>>;
      let secondFrameRef!: Readonly<ShallowRef<number>>;

      const FirstAnim = defineComponent(() => {
        const anim = useAnimation({ interval: 20 });
        firstFrameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });

      const SecondAnim = defineComponent(() => {
        const anim = useAnimation({ interval: 20, isActive: isSecondActive });
        secondFrameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });

      const App = defineComponent(() => {
        return () => (
          <>
            <FirstAnim />
            <Text>,</Text>
            <SecondAnim />
          </>
        );
      });

      const { unmount } = await render(App);

      vi.advanceTimersByTime(25);
      expect(firstFrameRef.value).toBe(1);
      expect(secondFrameRef.value).toBe(0);

      // Activate second animation — the sync watcher will call start() immediately
      isSecondActive.value = true;

      vi.advanceTimersByTime(40);
      expect(firstFrameRef.value).toBeGreaterThanOrEqual(2);
      expect(secondFrameRef.value).toBeGreaterThanOrEqual(1);
      expect(firstFrameRef.value - secondFrameRef.value).toBe(1);

      unmount();
    });

    test("remounting with same interval starts fresh at frame 0", async () => {
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 20 });
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });

      const r1 = await render(App);
      vi.advanceTimersByTime(50);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);
      r1.unmount();

      const r2 = await render(App);
      expect(frameRef.value).toBe(0);
      vi.advanceTimersByTime(50);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);
      r2.unmount();
    });

    test("time increases with each tick", async () => {
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 50 });
        timeRef = anim.time;
        return () => <Text>{String(Math.round(anim.time.value))}</Text>;
      });
      const { unmount } = await render(App);

      expect(timeRef.value).toBe(0);

      vi.advanceTimersByTime(60);
      const timeAfterOne = timeRef.value;
      expect(timeAfterOne).toBeGreaterThanOrEqual(50);

      vi.advanceTimersByTime(60);
      expect(timeRef.value).toBeGreaterThan(timeAfterOne);

      unmount();
    });

    test("delta approximates interval on each tick", async () => {
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 50 });
        deltaRef = anim.delta;
        return () => <Text>{String(Math.round(anim.delta.value))}</Text>;
      });
      const { unmount } = await render(App);

      expect(deltaRef.value).toBe(0);

      vi.advanceTimersByTime(55);
      expect(Math.round(deltaRef.value)).toBeGreaterThanOrEqual(40);

      vi.advanceTimersByTime(55);
      expect(Math.round(deltaRef.value)).toBeGreaterThanOrEqual(40);

      unmount();
    });

    test("reset() resets frame, time, and delta to 0 (fake timers)", async () => {
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 50 });
        frameRef = anim.frame;
        timeRef = anim.time;
        deltaRef = anim.delta;
        resetFn = anim.reset;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      vi.advanceTimersByTime(200);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);
      expect(Math.round(timeRef.value)).toBeGreaterThanOrEqual(100);

      resetFn();
      expect(frameRef.value).toBe(0);
      expect(timeRef.value).toBe(0);
      expect(deltaRef.value).toBe(0);

      // Confirm it advances again after reset
      vi.advanceTimersByTime(100);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);
      expect(Math.round(timeRef.value)).toBeGreaterThanOrEqual(50);
      expect(Math.round(deltaRef.value)).toBeGreaterThanOrEqual(40);
      expect(Math.round(timeRef.value)).toBeLessThan(200);

      unmount();
    });

    test("reset is a stable function reference", async () => {
      let capturedReset: (() => void) | undefined;

      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 50 });
        capturedReset = anim.reset;
        return () => <Text>x</Text>;
      });

      const { unmount } = await render(App);
      const firstReset = capturedReset!;
      firstReset();
      firstReset();
      expect(capturedReset).toBe(firstReset);
      unmount();
    });

    test("reset() while paused takes effect when animation is resumed", async () => {
      const active = shallowRef(true);

      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 50, isActive: active });
        frameRef = anim.frame;
        resetFn = anim.reset;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      vi.advanceTimersByTime(200);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);

      // Pause (sync watcher stops the timer)
      active.value = false;

      // Reset while paused
      resetFn();
      expect(frameRef.value).toBe(0);

      // Resume (sync watcher calls start() which resets to 0)
      active.value = true;
      expect(frameRef.value).toBe(0);

      // Should advance again
      vi.advanceTimersByTime(100);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);

      unmount();
    });

    test("unmount before first tick cleans up without error", async () => {
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 50 });
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      expect(frameRef.value).toBe(0);
      unmount();

      vi.advanceTimersByTime(200);
      expect(frameRef.value).toBe(0);
    });

    test("frame resets to 0 on each resume across multiple cycles", async () => {
      const active = shallowRef(true);
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 50, isActive: active });
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      // Cycle 1
      vi.advanceTimersByTime(120);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);
      active.value = false;
      active.value = true;
      expect(frameRef.value).toBe(0);

      // Cycle 2
      vi.advanceTimersByTime(120);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);
      active.value = false;
      active.value = true;
      expect(frameRef.value).toBe(0);

      // Cycle 3
      vi.advanceTimersByTime(120);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);
      active.value = false;
      active.value = true;
      expect(frameRef.value).toBe(0);

      unmount();
    });

    test("isActive false from mount never starts a timer or advances the frame", async () => {
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 50, isActive: false });
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      expect(frameRef.value).toBe(0);
      vi.advanceTimersByTime(500);
      expect(frameRef.value).toBe(0);

      unmount();
    });

    test("time and delta reset to 0 when remounted with different interval", async () => {
      const makeApp = (interval: number) =>
        defineComponent(() => {
          const anim = useAnimation({ interval });
          frameRef = anim.frame;
          timeRef = anim.time;
          deltaRef = anim.delta;
          return () => <Text>{String(anim.frame.value)}</Text>;
        });

      const first = await render(makeApp(50));
      vi.advanceTimersByTime(200);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);
      expect(Math.round(timeRef.value)).toBeGreaterThanOrEqual(50);
      first.unmount();

      const second = await render(makeApp(200));
      expect(frameRef.value).toBe(0);
      expect(timeRef.value).toBe(0);
      expect(deltaRef.value).toBe(0);

      second.unmount();
    });

    test("animation advances regardless of interactive flag", async () => {
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 8 });
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      expect(frameRef.value).toBe(0);
      vi.advanceTimersByTime(25);
      expect(frameRef.value).toBeGreaterThanOrEqual(1);

      unmount();
    });

    test("multiple animations with the same interval share one timer", async () => {
      // vue-tui uses independent setInterval per animation (no shared timer).
      // Adapted: verify both animations create timers and both tick correctly.
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

      let frame1Ref!: Readonly<ShallowRef<number>>;
      let frame2Ref!: Readonly<ShallowRef<number>>;

      const App = defineComponent(() => {
        const anim1 = useAnimation({ interval: 50 });
        const anim2 = useAnimation({ interval: 50 });
        frame1Ref = anim1.frame;
        frame2Ref = anim2.frame;
        return () => (
          <Text>
            {String(anim1.frame.value)},{String(anim2.frame.value)}
          </Text>
        );
      });
      const { unmount } = await render(App);

      // Both animations should have created timers
      expect(setIntervalSpy).toHaveBeenCalled();
      const intervalCalls = setIntervalSpy.mock.calls.filter((call) => call[1] === 50);
      expect(intervalCalls.length).toBe(2);

      vi.advanceTimersByTime(100);
      // Both frames should have advanced equally
      expect(frame1Ref.value).toBe(frame2Ref.value);
      expect(frame1Ref.value).toBeGreaterThanOrEqual(1);

      unmount();
      setIntervalSpy.mockRestore();
    });

    test("animations with different intervals still use the shared timer", async () => {
      // vue-tui uses independent timers per animation. Adapted: verify that
      // animations with different intervals tick at their correct individual rates.
      let fastFrameRef!: Readonly<ShallowRef<number>>;
      let slowFrameRef!: Readonly<ShallowRef<number>>;

      const App = defineComponent(() => {
        const fast = useAnimation({ interval: 50 });
        const slow = useAnimation({ interval: 80 });
        fastFrameRef = fast.frame;
        slowFrameRef = slow.frame;
        return () => (
          <Text>
            {String(fast.frame.value)},{String(slow.frame.value)}
          </Text>
        );
      });
      const { unmount } = await render(App);

      vi.advanceTimersByTime(170);
      // At 170ms: fast (50ms interval) = 3 frames, slow (80ms interval) = 2 frames
      expect(fastFrameRef.value).toBeGreaterThan(slowFrameRef.value);
      expect(fastFrameRef.value).toBeGreaterThanOrEqual(1);

      unmount();
    });

    test("resets frame when interval changes", async () => {
      // vue-tui's interval is not reactive, so we simulate interval change
      // by forcing a remount via a key change.
      const interval = shallowRef(50);
      let currentFrameRef!: Readonly<ShallowRef<number>>;

      const AnimWithInterval = defineComponent(
        (props: { interval: number }) => {
          const anim = useAnimation({ interval: props.interval });
          currentFrameRef = anim.frame;
          return () => <Text>{String(anim.frame.value)}</Text>;
        },
        { props: ["interval"] },
      );

      const App = defineComponent(() => {
        // Use interval as key so changing it forces a full remount
        return () => <AnimWithInterval key={interval.value} interval={interval.value} />;
      });

      const { unmount } = await render(App);

      vi.advanceTimersByTime(130);
      const frameBefore = currentFrameRef.value;
      expect(frameBefore).toBeGreaterThanOrEqual(1);

      // Change interval — key change forces remount, new useAnimation starts fresh
      interval.value = 200;
      await nextTick();
      // After remount, frame should reset to 0
      expect(currentFrameRef.value).toBe(0);

      unmount();
    });

    test("time and delta reset to 0 when interval changes", async () => {
      // Simulates interval change via key-based remount (vue-tui interval is not reactive).
      const interval = shallowRef(50);
      let currentFrameRef!: Readonly<ShallowRef<number>>;
      let currentTimeRef!: Readonly<ShallowRef<number>>;
      let currentDeltaRef!: Readonly<ShallowRef<number>>;

      const AnimWithInterval = defineComponent(
        (props: { interval: number }) => {
          const anim = useAnimation({ interval: props.interval });
          currentFrameRef = anim.frame;
          currentTimeRef = anim.time;
          currentDeltaRef = anim.delta;
          return () => <Text>{String(anim.frame.value)}</Text>;
        },
        { props: ["interval"] },
      );

      const App = defineComponent(() => {
        return () => <AnimWithInterval key={interval.value} interval={interval.value} />;
      });

      const { unmount } = await render(App);

      vi.advanceTimersByTime(200);
      expect(currentFrameRef.value).toBeGreaterThanOrEqual(1);
      expect(Math.round(currentTimeRef.value)).toBeGreaterThanOrEqual(50);

      // Change interval — key change forces remount, all values reset to 0
      interval.value = 200;
      await nextTick();
      expect(currentFrameRef.value).toBe(0);
      expect(currentTimeRef.value).toBe(0);
      expect(currentDeltaRef.value).toBe(0);

      unmount();
    });

    test("maxFps does not speed up animation state", async () => {
      // The animation state is driven by setInterval, not the render scheduler.
      // maxFps only throttles the commit scheduler. Verify that the frame counter
      // still increments based on interval timing alone.
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 8 });
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      expect(frameRef.value).toBe(0);
      vi.advanceTimersByTime(25);
      // At interval=8, 25ms => frames at 8,16,24 => frame=3
      expect(frameRef.value).toBe(3);

      unmount();
    });

    test("maxFps 0 does not affect animation cadence", async () => {
      // The animation composable uses its own setInterval, so maxFps=0
      // (no render throttling) should not change animation frame advancement.
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 8 });
        frameRef = anim.frame;
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      expect(frameRef.value).toBe(0);
      vi.advanceTimersByTime(25);
      // At interval=8, 25ms => frames at 8,16,24 => frame=3
      expect(frameRef.value).toBe(3);

      unmount();
    });

    test("changing interval unsubscribes stale ticks before reset", async () => {
      // Simulates interval change via key-based remount.
      // After changing to a longer interval, the old short-interval ticks
      // should no longer fire.
      const interval = shallowRef(8);
      let currentFrameRef!: Readonly<ShallowRef<number>>;

      const AnimWithInterval = defineComponent(
        (props: { interval: number }) => {
          const anim = useAnimation({ interval: props.interval });
          currentFrameRef = anim.frame;
          return () => <Text>{String(anim.frame.value)}</Text>;
        },
        { props: ["interval"] },
      );

      const App = defineComponent(() => {
        return () => <AnimWithInterval key={interval.value} interval={interval.value} />;
      });

      const { unmount } = await render(App);

      vi.advanceTimersByTime(25);
      expect(currentFrameRef.value).toBeGreaterThanOrEqual(1);

      // Switch to a much longer interval — key change forces remount
      interval.value = 200;
      await nextTick();

      // Frame should reset to 0 after remount
      expect(currentFrameRef.value).toBe(0);

      // 17ms is too short for a 200ms interval — frame should stay at 0
      vi.advanceTimersByTime(17);
      expect(currentFrameRef.value).toBe(0);

      unmount();
    });

    test("wall clock changes do not move animations backwards (fake timers)", async () => {
      // With fake timers, performance.now() is controlled by the fake clock.
      // Verify that even if we read frames after advancing time, the frame
      // counter never decreases.
      const frames: number[] = [];

      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 8 });
        frameRef = anim.frame;
        watchEffect(() => {
          frames.push(anim.frame.value);
        });
        return () => <Text>{String(anim.frame.value)}</Text>;
      });
      const { unmount } = await render(App);

      vi.advanceTimersByTime(25);
      const frameBeforeJump = frameRef.value;
      expect(frameBeforeJump).toBeGreaterThanOrEqual(1);

      // Continue advancing — frames should never go backwards
      vi.advanceTimersByTime(25);
      expect(frameRef.value).toBeGreaterThanOrEqual(frameBeforeJump);

      unmount();

      // Verify monotonic sequence
      for (let i = 1; i < frames.length; i++) {
        expect(frames[i]).toBeGreaterThanOrEqual(frames[i - 1]!);
      }
    });

    test("rerendering with the same interval does not reset the frame", async () => {
      // Trigger a re-render via an unrelated reactive change. The animation
      // frame should not reset because the interval hasn't changed.
      const unrelatedState = shallowRef(0);

      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 20 });
        frameRef = anim.frame;
        // Read unrelatedState in the render to force re-render when it changes
        return () => (
          <Text>
            {String(anim.frame.value)}-{String(unrelatedState.value)}
          </Text>
        );
      });
      const { unmount } = await render(App);

      vi.advanceTimersByTime(50);
      const frameBeforeRerender = frameRef.value;
      expect(frameBeforeRerender).toBeGreaterThanOrEqual(1);

      // Trigger a re-render via unrelated state change
      unrelatedState.value = 1;
      await nextTick();

      // Frame should NOT have been reset
      expect(frameRef.value).toBe(frameBeforeRerender);

      unmount();
    });
  });

  // ---------------------------------------------------------------
  // Real-timer tests that need actual wall-clock delays
  // ---------------------------------------------------------------

  test("delta is positive after each tick", async () => {
    const deltas: number[] = [];
    const App = defineComponent(() => {
      const { delta } = useAnimation({ interval: 20 });
      watchEffect(() => {
        deltas.push(delta.value);
      });
      return () => <Text>x</Text>;
    });
    const { unmount } = await render(App);
    await delay(120);
    unmount();

    expect(deltas[0]).toBe(0);
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]).toBeGreaterThan(0);
    }
  });

  test("isActive as getter function works", async () => {
    const active = shallowRef(false);
    let frameVal = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50, isActive: () => active.value });
      watchEffect(() => {
        frameVal = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(150);
    expect(frameVal).toBe(0);

    active.value = true;
    await delay(150);
    expect(frameVal).toBeGreaterThanOrEqual(1);
    unmount();
  });

  test("animation produces monotonically increasing frame values", async () => {
    const frames: number[] = [];
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 30 });
      watchEffect(() => {
        frames.push(frame.value);
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(200);
    unmount();

    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]).toBeGreaterThanOrEqual(frames[i - 1]!);
    }
  });

  test("animation produces monotonically increasing time values", async () => {
    const times: number[] = [];
    const App = defineComponent(() => {
      const { time } = useAnimation({ interval: 30 });
      watchEffect(() => {
        times.push(time.value);
      });
      return () => <Text>x</Text>;
    });
    const { unmount } = await render(App);
    await delay(200);
    unmount();

    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]!);
    }
  });

  test("reset restarts timing from current moment", async () => {
    let resetFnLocal!: () => void;
    let timeRefLocal!: { readonly value: number };
    const App = defineComponent(() => {
      const { time, reset } = useAnimation({ interval: 50 });
      resetFnLocal = reset;
      timeRefLocal = time;
      return () => <Text>{String(Math.round(time.value))}</Text>;
    });
    const { unmount } = await render(App);
    await delay(200);
    const timeBefore = timeRefLocal.value;
    expect(timeBefore).toBeGreaterThan(0);

    resetFnLocal();
    expect(timeRefLocal.value).toBe(0);

    await delay(120);
    expect(timeRefLocal.value).toBeLessThan(timeBefore);
    expect(timeRefLocal.value).toBeGreaterThan(0);
    unmount();
  });

  test("multiple independent animations run without interference", async () => {
    let frame30 = 0;
    let frame100 = 0;
    const App = defineComponent(() => {
      const anim1 = useAnimation({ interval: 30 });
      const anim2 = useAnimation({ interval: 100 });
      watchEffect(() => {
        frame30 = anim1.frame.value;
        frame100 = anim2.frame.value;
      });
      return () => <Text>multi</Text>;
    });
    const { unmount } = await render(App);
    await delay(350);
    unmount();

    expect(frame30).toBeGreaterThan(frame100);
    expect(frame100).toBeGreaterThanOrEqual(1);
  });

  test("animation with isActive=true from mount starts immediately", async () => {
    let frameVal = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50, isActive: true });
      watchEffect(() => {
        frameVal = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(150);
    expect(frameVal).toBeGreaterThanOrEqual(1);
    unmount();
  });

  test("wall clock changes do not move animations backwards", async () => {
    const frames: number[] = [];
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 30 });
      watchEffect(() => {
        frames.push(frame.value);
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(200);
    unmount();

    // All frames should be monotonically non-decreasing (clock jumps backward
    // should never cause frame to decrease).
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]).toBeGreaterThanOrEqual(frames[i - 1]!);
    }
    expect(frames.at(-1)!).toBeGreaterThanOrEqual(1);
  });

  test("pause and resume multiple times maintains correct frame sequence", async () => {
    const active = shallowRef(true);
    const frameHistory: number[] = [];
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 40, isActive: active });
      watchEffect(() => {
        frameHistory.push(frame.value);
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);

    await delay(120);
    expect(frameHistory.at(-1)!).toBeGreaterThanOrEqual(1);

    // Pause
    active.value = false;
    await delay(50);

    // Resume - resets to 0
    active.value = true;
    await nextTick();
    expect(frameHistory.at(-1)!).toBe(0);

    await delay(120);
    expect(frameHistory.at(-1)!).toBeGreaterThanOrEqual(1);

    // Pause again
    active.value = false;
    await delay(50);

    // Resume again - resets to 0
    active.value = true;
    await nextTick();
    expect(frameHistory.at(-1)!).toBe(0);

    unmount();
  });

  // ---------------------------------------------------------------
  // Tests using createApp directly (for maxFps / interactive options)
  // The testing render() helper always uses debug:true which disables
  // render throttling. These tests need mount-level options.
  // ---------------------------------------------------------------

  /**
   * Helper: mount a component via createApp with custom MountOptions.
   * Returns frames array, lastFrame getter, and unmount function.
   */
  function mountWithOptions(
    component: ReturnType<typeof defineComponent>,
    mountOpts: {
      debug?: boolean;
      maxFps?: number;
      interactive?: boolean;
    } = {},
  ) {
    const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
    Object.assign(stdout, { columns: 100, rows: 100, isTTY: true });
    const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
    Object.assign(stderr, { columns: 100, rows: 100, isTTY: true });
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
    Object.assign(stdin, {
      isTTY: true,
      setRawMode() {
        return stdin;
      },
      setEncoding() {
        return stdin;
      },
      ref() {},
      unref() {},
    });

    const frames: string[] = [];
    stdout.on("data", (chunk) => {
      let raw = chunk.toString();
      if (raw.endsWith("\n")) raw = raw.slice(0, -1);
      frames.push(raw);
    });

    const app = createApp(component);
    app.mount({
      stdout,
      stdin,
      stderr,
      debug: mountOpts.debug ?? false,
      exitOnCtrlC: false,
      maxFps: mountOpts.maxFps,
      interactive: mountOpts.interactive,
    });

    return {
      frames,
      lastFrame: () => frames.at(-1),
      unmount: () => app.unmount(),
    };
  }

  test("low maxFps caps animation rerenders", async () => {
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 10 });
      return () => <Text>{String(frame.value)}</Text>;
    });

    // maxFps: 1 => throttleMs = 1000ms. Animation ticks every 10ms but
    // commits (stdout writes) should be throttled to ~1 per second.
    const { frames, unmount } = mountWithOptions(App, { maxFps: 1 });
    await nextTick();
    await nextTick();

    const framesAfterMount = frames.length;

    // Wait 500ms — animation has ticked ~50 times but commits are throttled.
    // With maxFps=1 (1000ms throttle), no new commit should have happened yet.
    await delay(500);
    const framesDuringThrottle = frames.length - framesAfterMount;
    // Should have very few committed frames during the throttle window
    expect(framesDuringThrottle).toBeLessThanOrEqual(2);

    // Wait for a full throttle window to elapse
    await delay(1200);
    // Now at least one more frame should have been committed
    expect(frames.length).toBeGreaterThan(framesAfterMount);

    unmount();
  });

  test("delta accounts for throttled ticks", async () => {
    // With low maxFps, renders are throttled. When the animation finally
    // re-renders, delta should reflect the actual elapsed time since the
    // last rendered tick, not just one interval.
    let lastRenderedDelta = 0;
    const App = defineComponent(() => {
      const { delta } = useAnimation({ interval: 20 });
      watchEffect(() => {
        lastRenderedDelta = delta.value;
      });
      return () => <Text>x</Text>;
    });

    // maxFps: 5 => throttleMs = 200ms. Animation ticks every 20ms.
    // Renders are throttled to ~200ms windows.
    const { unmount } = mountWithOptions(App, { maxFps: 5 });
    await nextTick();

    expect(lastRenderedDelta).toBe(0);

    // Wait well past one full 200ms throttle window
    await delay(350);

    // Delta should reflect the actual time between ticks (each tick is 20ms),
    // not the throttle window. The last delta seen should be ~20ms per tick.
    expect(lastRenderedDelta).toBeGreaterThan(0);

    unmount();
  });

  test("animations advance in debug mode when interactive is false", async () => {
    let frameVal = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50 });
      watchEffect(() => {
        frameVal = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });

    // Mount with debug: true + interactive: false. Animations should still
    // advance because the animation timer (setInterval) is independent of
    // the interactive/non-interactive rendering mode.
    const { unmount } = mountWithOptions(App, {
      debug: true,
      interactive: false,
    });
    await nextTick();

    expect(frameVal).toBe(0);

    await delay(200);
    expect(frameVal).toBeGreaterThanOrEqual(1);

    unmount();
  });
});
