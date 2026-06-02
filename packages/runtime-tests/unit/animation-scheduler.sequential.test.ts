// Sequential: uses vi.useFakeTimers (process-global timer mocking). See the
// other *.sequential.test files. The describe blocks are describe.sequential.

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
// Internal module not in package exports — import via relative source path,
// matching the convention in integration/lifecycle/write-synchronized.test.ts.
import {
  createAnimationScheduler,
  createNoOpAnimationScheduler,
  normalizeInterval,
} from "../../runtime/src/animation-scheduler.ts";

describe.sequential("normalizeInterval", () => {
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

describe.sequential("createAnimationScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("same-interval subscribers share one timer", () => {
    const s = createAnimationScheduler();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const a = vi.fn();
    const b = vi.fn();
    s.subscribe(a, 50);
    s.subscribe(b, 50);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(50);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy.mock.calls.every((c) => c[1] === 50)).toBe(true);
    s.dispose();
  });

  test("different intervals wake at earliest deadline", () => {
    const s = createAnimationScheduler();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    s.subscribe(vi.fn(), 50);
    s.subscribe(vi.fn(), 80);
    expect(vi.getTimerCount()).toBe(1);
    expect(setTimeoutSpy.mock.calls[0]?.[1]).toBe(50);
    vi.advanceTimersByTime(50);
    expect(setTimeoutSpy.mock.calls.at(-1)?.[1]).toBe(30);
    s.dispose();
  });

  test("late subscriber with earlier deadline reschedules", () => {
    const s = createAnimationScheduler();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    s.subscribe(vi.fn(), 100);
    vi.advanceTimersByTime(20);
    const early = vi.fn();
    s.subscribe(early, 10);
    expect(setTimeoutSpy.mock.calls.at(-1)?.[1]).toBe(10);
    vi.advanceTimersByTime(10);
    expect(early).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  test("last unsubscribe clears the timer", () => {
    const s = createAnimationScheduler();
    const { unsubscribe } = s.subscribe(vi.fn(), 50);
    expect(vi.getTimerCount()).toBe(1);
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("partial unsubscribe keeps timer alive", () => {
    const s = createAnimationScheduler();
    const first = s.subscribe(vi.fn(), 50);
    s.subscribe(vi.fn(), 50);
    first.unsubscribe();
    expect(vi.getTimerCount()).toBe(1);
    s.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("elapsed-time frame catch-up", () => {
    const s = createAnimationScheduler();
    let lastFrame = -1;
    let startTime = 0;
    const handle = s.subscribe((now) => {
      lastFrame = Math.floor((now - startTime) / 50);
    }, 50);
    startTime = handle.startTime;
    vi.advanceTimersByTime(220);
    expect(lastFrame).toBe(4);
    s.dispose();
  });

  test("reentrancy: callback A unsubscribes B before B's turn", () => {
    const s = createAnimationScheduler();
    const b = vi.fn();
    let bHandle: { unsubscribe: () => void };
    const a = vi.fn(() => bHandle.unsubscribe());
    s.subscribe(a, 50);
    bHandle = s.subscribe(b, 50);
    vi.advanceTimersByTime(50);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    s.dispose();
  });

  test("reentrancy: callback subscribes during dispatch", () => {
    const s = createAnimationScheduler();
    const c = vi.fn();
    const a = vi.fn(() => {
      s.subscribe(c, 50);
    });
    s.subscribe(a, 50);
    vi.advanceTimersByTime(50);
    expect(c).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(c).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  test("reentrancy: callback resets itself without crashing", () => {
    const s = createAnimationScheduler();
    let handle: { startTime: number; unsubscribe: () => void };
    const cb = vi.fn(() => {
      handle.unsubscribe();
      handle = s.subscribe(cb, 50);
    });
    handle = s.subscribe(cb, 50);
    expect(() => vi.advanceTimersByTime(150)).not.toThrow();
    expect(cb).toHaveBeenCalled();
    s.dispose();
  });

  test("dispose clears everything", () => {
    const s = createAnimationScheduler();
    s.subscribe(vi.fn(), 50);
    s.subscribe(vi.fn(), 80);
    s.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe.sequential("createNoOpAnimationScheduler", () => {
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
