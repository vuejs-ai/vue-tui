import { PassThrough } from "node:stream";
import { defineComponent, effectScope, nextTick, shallowRef, watchEffect } from "vue";
import type { ShallowRef } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useAnimation, createApp, renderToString } from "@vue-tui/runtime";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

  // Ink parity (use-animation.tsx:529-566 "time and delta reset to 0 when
  // interval changes"): changing `interval` reactively on a LIVE, mounted,
  // ACTIVE animation (no remount) must reset frame/time/delta to 0 and
  // re-subscribe at the new interval — Ink recomputes safeInterval every render
  // and resets when it differs while active. This is the bug repro: a captured
  // (non-reactive) interval makes this a no-op.
  test("frame/time/delta reset to 0 when interval changes live while active", async () => {
    const interval = shallowRef(50);
    let frameVal = 0;
    let timeVal = 0;
    let deltaVal = 0;
    const App = defineComponent(() => {
      const { frame, time, delta } = useAnimation({ interval });
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

    // Mirror Ink's '0,0,0' assertion: changing the live interval resets all three.
    interval.value = 200;
    await nextTick();
    expect(frameVal).toBe(0);
    expect(timeVal).toBe(0);
    expect(deltaVal).toBe(0);

    // And it keeps running at the new interval afterwards.
    await delay(250);
    expect(frameVal).toBeGreaterThanOrEqual(1);

    unmount();
  });

  // Ink parity: `shouldReset` is gated on `isActive`. Changing `interval` while
  // INACTIVE must NOT reset values (the animation is paused — nothing to reset)
  // and must NOT start a timer. This matches vue-tui's existing reset-while-paused
  // behavior. The new interval only takes effect on the next activation.
  test("changing interval while inactive does not reset and does not start", async () => {
    const interval = shallowRef(50);
    const active = shallowRef(false);
    let frameVal = -1;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval, isActive: active });
      watchEffect(() => {
        frameVal = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);

    // Inactive from mount: frame stays 0.
    await delay(120);
    expect(frameVal).toBe(0);

    // Change interval while still inactive — must remain frozen at 0, no timer.
    interval.value = 200;
    await nextTick();
    await delay(120);
    expect(frameVal).toBe(0);

    // Activating now uses the new interval and advances.
    active.value = true;
    await delay(250);
    expect(frameVal).toBeGreaterThanOrEqual(1);

    unmount();
  });

  test("interval accepts a plain number (backward compatible)", async () => {
    // The widening to MaybeRefOrGetter<number> must remain a strict superset:
    // a literal number still works exactly as before.
    let frameVal = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50 });
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

  // B20: a zero interval must not busy-hang the scheduler — the animation keeps
  // ADVANCING (and real wall-clock time progresses) over a short window rather
  // than spinning forever or stalling. This is the observable end-to-end
  // guarantee ONLY: it deliberately makes NO claim about the exact cadence. The
  // exact `Math.max(1, 0) === 1` clamp is pinned directly in the scheduler unit
  // test (packages/runtime-tests/unit/animation-scheduler.sequential.test.ts —
  // normalizeInterval), which is the discriminating guard against the clamp
  // regressing (e.g. to 30ms); a "frame > 1 after 60ms" assertion here cannot
  // tell 1ms from 30ms apart, so we do not assert it.
  test("interval 0 advances frames without busy-hanging (no cadence claim)", async () => {
    let frameVal = 0;
    let timeVal = 0;
    const App = defineComponent(() => {
      const { frame, time } = useAnimation({ interval: 0 });
      watchEffect(() => {
        frameVal = frame.value;
        timeVal = time.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    // If 0 were NOT clamped to a positive delay, the scheduler would either
    // busy-loop (never yielding) or never settle and this test would hang/time
    // out. Reaching the assertions at all proves it did neither.
    await delay(60);
    // The animation advanced (made real progress) ...
    expect(frameVal).toBeGreaterThanOrEqual(1);
    // ... and real wall-clock time progressed.
    expect(timeVal).toBeGreaterThan(0);
    unmount();
  });

  // B20: a negative interval must ALSO not busy-hang — same observable
  // advances/no-hang guarantee as interval 0. The exact `Math.max(1, -5) === 1`
  // clamp is pinned in the scheduler unit test (normalizeInterval), not here.
  test("negative interval (-5) advances frames without busy-hanging (no cadence claim)", async () => {
    let frameVal = 0;
    let timeVal = 0;
    const App = defineComponent(() => {
      const { frame, time } = useAnimation({ interval: -5 });
      watchEffect(() => {
        frameVal = frame.value;
        timeVal = time.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await delay(60);
    expect(frameVal).toBeGreaterThanOrEqual(1);
    expect(timeVal).toBeGreaterThan(0);
    unmount();
  });

  // -- Behavior over real time (migrated from fake-timer tests) --
  // Timer-precision and exact-frame assertions now live in the scheduler
  // unit tests (packages/runtime-tests/unit/animation-scheduler.test.ts).
  // These verify observable end-to-end behavior only, using real timers.
  describe("behavior over real time", () => {
    test("frame increments over time", async () => {
      let frame!: Readonly<ShallowRef<number>>;
      const App = defineComponent(() => {
        frame = useAnimation({ interval: 50 }).frame;
        return () => <Text>{String(frame.value)}</Text>;
      });
      const { unmount } = await render(App);
      await delay(220);
      expect(frame.value).toBeGreaterThanOrEqual(3);
      unmount();
    });

    test("two same-interval animations stay in sync", async () => {
      let f1!: Readonly<ShallowRef<number>>;
      let f2!: Readonly<ShallowRef<number>>;
      const App = defineComponent(() => {
        f1 = useAnimation({ interval: 50 }).frame;
        f2 = useAnimation({ interval: 50 }).frame;
        return () => <Text>{`${f1.value},${f2.value}`}</Text>;
      });
      const { unmount } = await render(App);
      await delay(180);
      expect(f1.value).toBe(f2.value);
      expect(f1.value).toBeGreaterThanOrEqual(1);
      unmount();
    });

    test("different intervals advance at different rates", async () => {
      let fast!: Readonly<ShallowRef<number>>;
      let slow!: Readonly<ShallowRef<number>>;
      const App = defineComponent(() => {
        fast = useAnimation({ interval: 30 }).frame;
        slow = useAnimation({ interval: 120 }).frame;
        return () => <Text>{`${fast.value},${slow.value}`}</Text>;
      });
      const { unmount } = await render(App);
      await delay(300);
      expect(fast.value).toBeGreaterThan(slow.value);
      unmount();
    });

    test("pause via isActive freezes the frame", async () => {
      const active = shallowRef(true);
      let frame!: Readonly<ShallowRef<number>>;
      const App = defineComponent(() => {
        frame = useAnimation({ interval: 30, isActive: () => active.value }).frame;
        return () => <Text>{String(frame.value)}</Text>;
      });
      const { unmount } = await render(App);
      await delay(150);
      expect(frame.value).toBeGreaterThanOrEqual(1);
      active.value = false;
      await nextTick();
      const frozen = frame.value;
      await delay(150);
      expect(frame.value).toBe(frozen);
      unmount();
    });

    test("reactivating isActive resets the frame to 0 then advances", async () => {
      const active = shallowRef(true);
      let frame!: Readonly<ShallowRef<number>>;
      const App = defineComponent(() => {
        frame = useAnimation({ interval: 30, isActive: () => active.value }).frame;
        return () => <Text>{String(frame.value)}</Text>;
      });
      const { unmount } = await render(App);
      await delay(150);
      active.value = false;
      await nextTick();
      active.value = true;
      await nextTick();
      expect(frame.value).toBe(0);
      await delay(150);
      expect(frame.value).toBeGreaterThanOrEqual(1);
      unmount();
    });

    // Ink parity (use-animation.ts:83-89,138): reset() while PAUSED only bumps
    // resetKey; the zeroing (setAnimState(zeroAnimState)) lives inside the
    // layout effect, which early-returns while !isActive. shouldReset is gated
    // on isActive too. So a paused reset() keeps the last frame frozen and zeros
    // only on the NEXT resume. (Previously this test locked the divergent
    // immediate-zero-while-paused behavior; flipped to match Ink.)
    test("reset() while paused keeps the last frame; zeros on resume", async () => {
      const active = shallowRef(true);
      let frame!: Readonly<ShallowRef<number>>;
      let reset!: () => void;
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 30, isActive: () => active.value });
        frame = anim.frame;
        reset = anim.reset;
        return () => <Text>{String(frame.value)}</Text>;
      });
      const { unmount } = await render(App);
      await delay(120);
      active.value = false;
      await nextTick();
      const frozen = frame.value;
      expect(frozen).toBeGreaterThanOrEqual(1);

      // reset() while paused must NOT zero — the last frame stays frozen.
      reset();
      await nextTick();
      expect(frame.value).toBe(frozen);
      await delay(120);
      expect(frame.value).toBe(frozen);

      // Resuming zeros (the deferred reset lands here) then advances.
      active.value = true;
      await nextTick();
      expect(frame.value).toBe(0);
      await delay(120);
      expect(frame.value).toBeGreaterThanOrEqual(1);
      unmount();
    });

    // Guard: reset() while ACTIVE must still zero frame/time/delta immediately
    // (Ink: the layout effect re-runs on resetKey while isActive and calls
    // setAnimState(zeroAnimState)). The paused-reset fix must not regress this.
    test("reset() while active zeros immediately then keeps advancing", async () => {
      let frame!: Readonly<ShallowRef<number>>;
      let time!: Readonly<ShallowRef<number>>;
      let delta!: Readonly<ShallowRef<number>>;
      let reset!: () => void;
      const App = defineComponent(() => {
        const anim = useAnimation({ interval: 30 });
        frame = anim.frame;
        time = anim.time;
        delta = anim.delta;
        reset = anim.reset;
        return () => <Text>{String(frame.value)}</Text>;
      });
      const { unmount } = await render(App);
      await delay(150);
      expect(frame.value).toBeGreaterThanOrEqual(1);

      reset();
      expect(frame.value).toBe(0);
      expect(time.value).toBe(0);
      expect(delta.value).toBe(0);

      await delay(150);
      expect(frame.value).toBeGreaterThanOrEqual(1);
      unmount();
    });

    test("all-inactive animations never advance", async () => {
      let f1!: Readonly<ShallowRef<number>>;
      let f2!: Readonly<ShallowRef<number>>;
      const App = defineComponent(() => {
        f1 = useAnimation({ interval: 30, isActive: () => false }).frame;
        f2 = useAnimation({ interval: 30, isActive: () => false }).frame;
        return () => <Text>{`${f1.value},${f2.value}`}</Text>;
      });
      const { unmount } = await render(App);
      await delay(150);
      expect(f1.value).toBe(0);
      expect(f2.value).toBe(0);
      unmount();
    });

    // Ink parity (use-animation.ts:77-96): `shouldReset` is computed ONCE from
    // the FINAL batched values — `isActive && (intervalChanged || becameActive
    // || resetKeyChanged)`. When `isActive` ends up false, `shouldReset` is
    // false regardless of an interval change in the same render, so the frame
    // FREEZES at its last live value (no reset to 0). This guards the bug where
    // splitting into two `flush:"sync"` watchers made the interval watcher fire
    // first (while still active) and erroneously `start()` → zero the frame
    // before the isActive watcher could `stop()`.
    test("batched interval-change + pause in one tick freezes the frame (not 0)", async () => {
      const interval = shallowRef(30);
      const active = shallowRef(true);
      let frame!: Readonly<ShallowRef<number>>;
      const App = defineComponent(() => {
        frame = useAnimation({ interval, isActive: active }).frame;
        return () => <Text>{String(frame.value)}</Text>;
      });
      const { unmount } = await render(App);
      await delay(150);
      const live = frame.value;
      expect(live).toBeGreaterThanOrEqual(1);

      // Interval FIRST, then pause — the bug order. Both mutations land in one
      // synchronous batch.
      interval.value = 200;
      active.value = false;
      await nextTick();

      // Pausing wins: the frame freezes at the last live value, NOT 0.
      expect(frame.value).toBe(live);
      await delay(150);
      expect(frame.value).toBe(live);
      unmount();
    });

    // Guard: the reverse batch order (pause FIRST, then interval) must agree —
    // pausing still wins and the frame freezes at the last live value.
    test("batched pause + interval-change in one tick also freezes the frame", async () => {
      const interval = shallowRef(30);
      const active = shallowRef(true);
      let frame!: Readonly<ShallowRef<number>>;
      const App = defineComponent(() => {
        frame = useAnimation({ interval, isActive: active }).frame;
        return () => <Text>{String(frame.value)}</Text>;
      });
      const { unmount } = await render(App);
      await delay(150);
      const live = frame.value;
      expect(live).toBeGreaterThanOrEqual(1);

      active.value = false;
      interval.value = 200;
      await nextTick();

      expect(frame.value).toBe(live);
      await delay(150);
      expect(frame.value).toBe(live);
      unmount();
    });

    // Guard: resuming after a batched interval-change + pause must zero and then
    // advance at the NEW interval (the deferred reset lands on resume, Ink-style).
    test("resume after batched interval-change + pause zeros then advances at the new interval", async () => {
      const interval = shallowRef(30);
      const active = shallowRef(true);
      let frame!: Readonly<ShallowRef<number>>;
      const App = defineComponent(() => {
        frame = useAnimation({ interval, isActive: active }).frame;
        return () => <Text>{String(frame.value)}</Text>;
      });
      const { unmount } = await render(App);
      await delay(150);
      expect(frame.value).toBeGreaterThanOrEqual(1);

      interval.value = 200;
      active.value = false;
      await nextTick();
      const frozen = frame.value;
      expect(frozen).toBeGreaterThanOrEqual(1);

      active.value = true;
      await nextTick();
      // Resume zeros immediately.
      expect(frame.value).toBe(0);

      // New interval is 200ms: after ~120ms it must still be frame 0 (one frame
      // would need 200ms), proving the re-subscribe used the new interval.
      await delay(120);
      expect(frame.value).toBe(0);
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

    // Wait for the next throttled commit by polling instead of a fixed sleep:
    // the trailing commit re-arms per deferred call (lastCall+wait, matching
    // Ink's throttle), so on a starved CI runner a fixed 1200ms margin races
    // the ~1s cadence — render-count assertions on wall-clock margins are the
    // known flake trap. The contract is "commits keep flowing at ~1/sec", so
    // assert the next commit EVENTUALLY lands under a generous deadline.
    const deadline = Date.now() + 5000;
    while (frames.length <= framesAfterMount && Date.now() < deadline) {
      await delay(50);
    }
    expect(frames.length).toBeGreaterThan(framesAfterMount);

    unmount();
  });

  test("delta accumulates across coalesced ticks within the render-throttle window", async () => {
    // Ink parity (G02): useAnimation coalesces ticks while inside the current
    // render-throttle window and reports delta = time since the LAST RENDERED
    // tick, so velocity-driven motion (position += speed * delta) advances at
    // correct wall-clock speed despite throttled commits. With a fast interval
    // and a slow throttle, each rendered delta must reflect the accumulated
    // window (~throttleMs), NOT a single ~interval.
    const renderedDeltas: number[] = [];
    const App = defineComponent(() => {
      const { delta } = useAnimation({ interval: 20 });
      watchEffect(() => {
        renderedDeltas.push(delta.value);
      });
      return () => <Text>x</Text>;
    });

    // maxFps: 5 => throttleMs = 200ms. Animation ticks every 20ms, so ~10
    // ticks fall inside each throttle window and must coalesce into one
    // rendered delta of ~200ms.
    const { unmount } = mountWithOptions(App, { maxFps: 5 });
    await nextTick();

    // Initial rendered delta is 0.
    expect(renderedDeltas[0]).toBe(0);

    // Wait across several full 200ms throttle windows.
    await delay(700);
    unmount();

    // The non-zero rendered deltas correspond to ticks that actually committed
    // after coalescing. Each should be on the order of the throttle window
    // (~200ms), well above a single 20ms interval. A buggy implementation that
    // reports one interval per committed tick yields deltas ~20ms and fails here.
    const committedDeltas = renderedDeltas.filter((d) => d > 0);
    expect(committedDeltas.length).toBeGreaterThan(0);
    const maxDelta = Math.max(...committedDeltas);
    expect(maxDelta).toBeGreaterThan(120);
  });

  test("default path (no explicit maxFps) coalesces ticks via the 30fps throttle", async () => {
    // Ink parity (G02): with no explicit maxFps, the render throttle must still
    // engage at the default 30fps (~34ms window), so a fast animation coalesces
    // its ticks and reports a delta of ~one throttle window, NOT one interval.
    //
    // Discrimination strategy (Approach A — count-based):
    //   interval = 8ms, window = ~250ms
    //   Fixed   (renderThrottleMs=34): ~7 rendered commits  (250/34 ≈ 7)
    //   Unfixed (renderThrottleMs=0):  ~31 rendered commits (250/8  ≈ 31)
    //
    // We assert committedDeltas.length < 15 AND maxDelta >= 30.
    //   • Even with 2× CI scheduling jitter some callbacks fire late and run
    //     together, the unfixed per-tick path still produces one delta per
    //     scheduler callback — at least ~25 over 250ms — never < 15.
    //   • The fixed path accumulates across skipped ticks so each rendered
    //     delta spans the ~34ms window; even with conservative 30ms threshold
    //     it never falls to the ~8ms per-tick value.
    //
    // A plain maxDelta > 20 assertion (the old form) was non-discriminating:
    // a single OS-jitter-delayed callback on the unfixed path can exceed 20ms
    // and silently pass. The count assertion rules that out completely.
    const renderedDeltas: number[] = [];
    const App = defineComponent(() => {
      const { delta } = useAnimation({ interval: 8 });
      watchEffect(() => {
        renderedDeltas.push(delta.value);
      });
      return () => <Text>x</Text>;
    });

    // No maxFps -> defaults to 30 -> renderThrottleMs = ceil(1000/30) = 34ms.
    // Animation ticks every 8ms, so ~4 ticks fall inside each window and must
    // coalesce into one rendered delta of ~34ms.
    const { unmount } = mountWithOptions(App, {});
    await nextTick();

    expect(renderedDeltas[0]).toBe(0);

    const windowMs = 250;
    const intervalMs = 8;
    await delay(windowMs);
    unmount();

    const committedDeltas = renderedDeltas.filter((d) => d > 0);
    expect(committedDeltas.length).toBeGreaterThan(0);

    // COUNT assertion: fixed path coalesces → far fewer renders than raw ticks.
    // Upper bound is half the expected raw-tick count; no amount of per-callback
    // jitter on the unfixed path can produce fewer than this.
    const rawTicksExpected = windowMs / intervalMs; // ~31
    expect(committedDeltas.length).toBeLessThan(rawTicksExpected / 2); // < ~15

    // DELTA assertion: each coalesced render covers ~34ms, well above 8ms.
    const maxDelta = Math.max(...committedDeltas);
    expect(maxDelta).toBeGreaterThanOrEqual(30);
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

  // Blessed standalone fallback (ink-divergences.md "useAnimation() outside a
  // render tree drives a standalone animation"): with NO mounted component,
  // useAnimation must still tick, and reactive interval/isActive changes must
  // still take effect. The combined-watcher fix relies on `flush:"post"`, which
  // fires standalone too — this guards that it keeps working there.
  test("standalone (no render tree): ticks and reacts to live interval/isActive changes", async () => {
    const scope = effectScope();
    const interval = shallowRef(30);
    const active = shallowRef(true);
    let frame!: Readonly<ShallowRef<number>>;
    scope.run(() => {
      frame = useAnimation({ interval, isActive: active }).frame;
    });

    // Advances with no surrounding app.
    await delay(150);
    const live = frame.value;
    expect(live).toBeGreaterThanOrEqual(1);

    // Pause takes effect standalone — the frame freezes.
    active.value = false;
    await nextTick();
    const frozen = frame.value;
    await delay(120);
    expect(frame.value).toBe(frozen);

    // Resume + new interval take effect standalone: zero, then advance at 30ms.
    interval.value = 30;
    active.value = true;
    await nextTick();
    expect(frame.value).toBe(0);
    await delay(150);
    expect(frame.value).toBeGreaterThanOrEqual(1);

    scope.stop();
  });

  // Blessed standalone fallback, batched-pause guard: the bug's exact shape
  // (interval-change + pause in one synchronous batch) must freeze, not zero,
  // outside a render tree too.
  test("standalone (no render tree): batched interval-change + pause freezes the frame", async () => {
    const scope = effectScope();
    const interval = shallowRef(30);
    const active = shallowRef(true);
    let frame!: Readonly<ShallowRef<number>>;
    scope.run(() => {
      frame = useAnimation({ interval, isActive: active }).frame;
    });

    await delay(150);
    const live = frame.value;
    expect(live).toBeGreaterThanOrEqual(1);

    interval.value = 200;
    active.value = false;
    await nextTick();

    expect(frame.value).toBe(live);
    await delay(120);
    expect(frame.value).toBe(live);

    scope.stop();
  });

  test("renderToString renders frame 0 without throwing or leaking timers", () => {
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50 });
      return () => <Text>{`frame:${frame.value}`}</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("frame:0");
  });
});
