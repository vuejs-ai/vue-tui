// Formerly a *.sequential.test file driven by vi.useFakeTimers (process-global
// timer mocking). Now driven by an injected VirtualClock (see
// .agents/docs/clock.md): per-scheduler, no global mutation, so this file runs
// in the normal parallel pool.

import { describe, expect, test, vi } from "vite-plus/test";
// Internal module not in package exports — import via relative source path,
// matching the convention in integration/lifecycle/write-synchronized.test.ts.
import {
  createAnimationScheduler,
  createNoOpAnimationScheduler,
  normalizeInterval,
} from "../../runtime/src/animation-scheduler.ts";
import { createVirtualClock } from "../../runtime/src/io/clock.ts";

describe("normalizeInterval", () => {
  test("clamps and defaults", () => {
    expect(normalizeInterval(50)).toBe(50);
    expect(normalizeInterval(0)).toBe(1);
    expect(normalizeInterval(-5)).toBe(1);
    expect(normalizeInterval(-10)).toBe(1);
    expect(normalizeInterval(undefined)).toBe(100);
    expect(normalizeInterval(Number.NaN)).toBe(100);
    expect(normalizeInterval(Number.POSITIVE_INFINITY)).toBe(100);
    expect(normalizeInterval(Number.MAX_SAFE_INTEGER)).toBe(2_147_483_647);
  });

  test("preserves fractional intervals, matching Ink (no rounding)", () => {
    // Ink's normalizeAnimationInterval does NOT round (use-animation.ts:147-151),
    // so a 60fps interval (16.67ms) or 8.4ms stays fractional; rounding would drift
    // frame=floor(elapsed/interval) and the scheduler's nextDueTime over time.
    expect(normalizeInterval(16.67)).toBe(16.67);
    expect(normalizeInterval(8.4)).toBe(8.4);
    expect(normalizeInterval(0.5)).toBe(1); // still clamped to >= 1
  });
});

describe("createAnimationScheduler", () => {
  test("same-interval subscribers share one timer", async () => {
    const clock = createVirtualClock();
    const s = createAnimationScheduler(0, clock);
    const setTimeoutSpy = vi.spyOn(clock, "setTimeout");
    const a = vi.fn();
    const b = vi.fn();
    s.subscribe(a, 50);
    s.subscribe(b, 50);
    expect(clock.pendingTimers()).toHaveLength(1);
    await clock.advance(50);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy.mock.calls.every((c) => c[1] === 50)).toBe(true);
    s.dispose();
  });

  test("different intervals wake at earliest deadline", async () => {
    const clock = createVirtualClock();
    const s = createAnimationScheduler(0, clock);
    const setTimeoutSpy = vi.spyOn(clock, "setTimeout");
    s.subscribe(vi.fn(), 50);
    s.subscribe(vi.fn(), 80);
    expect(clock.pendingTimers()).toHaveLength(1);
    expect(setTimeoutSpy.mock.calls[0]?.[1]).toBe(50);
    await clock.advance(50);
    expect(setTimeoutSpy.mock.calls.at(-1)?.[1]).toBe(30);
    s.dispose();
  });

  test("late subscriber with earlier deadline reschedules", async () => {
    const clock = createVirtualClock();
    const s = createAnimationScheduler(0, clock);
    const setTimeoutSpy = vi.spyOn(clock, "setTimeout");
    s.subscribe(vi.fn(), 100);
    await clock.advance(20);
    const early = vi.fn();
    s.subscribe(early, 10);
    expect(setTimeoutSpy.mock.calls.at(-1)?.[1]).toBe(10);
    await clock.advance(10);
    expect(early).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  test("last unsubscribe clears the timer", () => {
    const clock = createVirtualClock();
    const s = createAnimationScheduler(0, clock);
    const { unsubscribe } = s.subscribe(vi.fn(), 50);
    expect(clock.pendingTimers()).toHaveLength(1);
    unsubscribe();
    expect(clock.pendingTimers()).toHaveLength(0);
  });

  test("partial unsubscribe keeps timer alive", () => {
    const clock = createVirtualClock();
    const s = createAnimationScheduler(0, clock);
    const first = s.subscribe(vi.fn(), 50);
    s.subscribe(vi.fn(), 50);
    first.unsubscribe();
    expect(clock.pendingTimers()).toHaveLength(1);
    s.dispose();
    expect(clock.pendingTimers()).toHaveLength(0);
  });

  test("elapsed-time frame catch-up", async () => {
    const clock = createVirtualClock();
    const s = createAnimationScheduler(0, clock);
    let lastFrame = -1;
    let startTime = 0;
    const handle = s.subscribe((now) => {
      lastFrame = Math.floor((now - startTime) / 50);
    }, 50);
    startTime = handle.startTime;
    await clock.advance(220);
    expect(lastFrame).toBe(4);
    s.dispose();
  });

  test("reentrancy: callback A unsubscribes B before B's turn", async () => {
    const clock = createVirtualClock();
    const s = createAnimationScheduler(0, clock);
    const b = vi.fn();
    let bHandle: { unsubscribe: () => void };
    const a = vi.fn(() => bHandle.unsubscribe());
    s.subscribe(a, 50);
    bHandle = s.subscribe(b, 50);
    await clock.advance(50);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    s.dispose();
  });

  test("reentrancy: callback subscribes during dispatch", async () => {
    const clock = createVirtualClock();
    const s = createAnimationScheduler(0, clock);
    const c = vi.fn();
    const a = vi.fn(() => {
      s.subscribe(c, 50);
    });
    s.subscribe(a, 50);
    await clock.advance(50);
    expect(c).not.toHaveBeenCalled();
    await clock.advance(50);
    expect(c).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  test("reentrancy: callback resets itself without crashing", async () => {
    const clock = createVirtualClock();
    const s = createAnimationScheduler(0, clock);
    let handle: { startTime: number; unsubscribe: () => void };
    const cb = vi.fn(() => {
      handle.unsubscribe();
      handle = s.subscribe(cb, 50);
    });
    handle = s.subscribe(cb, 50);
    await expect(clock.advance(150)).resolves.toBeUndefined();
    expect(cb).toHaveBeenCalled();
    s.dispose();
  });

  test("a throwing subscriber callback does not wedge the shared scheduler", async () => {
    // Regression: onTick set `isDispatching = true`, ran the subscriber
    // callbacks, then reset the flag / flushed `pending` / rescheduled with NO
    // try/finally. A throwing callback skipped all three, leaving isDispatching
    // stuck true forever — every later subscribe/unsubscribe queued into
    // `pending` and never ran, and no timer was ever rescheduled. One bad tick
    // permanently killed EVERY useAnimation instance sharing this scheduler.
    const clock = createVirtualClock();
    const s = createAnimationScheduler(0, clock);
    const boom = vi.fn(() => {
      throw new Error("boom in tick");
    });
    const boomHandle = s.subscribe(boom, 50);

    // The throw propagates out of the timer callback (house idiom: restore the
    // scheduler invariants, then rethrow — mirrors scheduler.ts doCommit); the
    // VirtualClock surfaces it by rejecting advance(). That is expected; what
    // must NOT happen is the scheduler wedging.
    await expect(clock.advance(50)).rejects.toThrow("boom in tick");
    expect(boom).toHaveBeenCalledTimes(1);

    // Remove the thrower (must run synchronously — proves isDispatching was
    // reset; on the buggy code this op was queued into `pending` and never ran).
    boomHandle.unsubscribe();

    // A subscriber added after the throw must still tick. On the buggy code its
    // add() was queued into `pending` (isDispatching never reset) and no timer
    // was ever scheduled, so it never fired.
    const recovered = vi.fn();
    s.subscribe(recovered, 50);
    await clock.advance(50);
    expect(recovered).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  test("dispose clears everything", () => {
    const clock = createVirtualClock();
    const s = createAnimationScheduler(0, clock);
    s.subscribe(vi.fn(), 50);
    s.subscribe(vi.fn(), 80);
    s.dispose();
    expect(clock.pendingTimers()).toHaveLength(0);
  });
});

describe("createNoOpAnimationScheduler", () => {
  test("subscribe returns inert handle, never ticks", () => {
    const s = createNoOpAnimationScheduler();
    const cb = vi.fn();
    const { startTime, unsubscribe } = s.subscribe(cb, 50);
    expect(startTime).toBe(0);
    expect(() => unsubscribe()).not.toThrow();
    expect(() => s.dispose()).not.toThrow();
    expect(cb).not.toHaveBeenCalled();
  });
});
