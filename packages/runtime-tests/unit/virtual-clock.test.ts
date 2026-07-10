// Unit tests for the VirtualClock itself — no renderer, no Vue app. The
// contract under test is .agents/docs/clock.md's advance() semantics: due
// ordering, insertion-order tiebreak, live-ledger re-query (same-instant
// re-registration), a microtask/nextTick drain barrier after every fire,
// defined throw semantics, and the runaway guard.

import { describe, expect, test, vi } from "vite-plus/test";
import { createVirtualClock } from "../../runtime/src/io/clock.ts";
import { createAnimationScheduler } from "../../runtime/src/animation-scheduler.ts";

describe("createVirtualClock", () => {
  test("starts at 0 and advance() moves virtual now to the target", async () => {
    const clock = createVirtualClock();
    expect(clock.now()).toBe(0);
    await clock.advance(100);
    expect(clock.now()).toBe(100);
  });

  test("fires due timers in deadline order, with virtual now at each due time", async () => {
    const clock = createVirtualClock();
    const fired: Array<[string, number]> = [];
    clock.setTimeout(() => fired.push(["b", clock.now()]), 30);
    clock.setTimeout(() => fired.push(["a", clock.now()]), 10);
    await clock.advance(50);
    expect(fired).toEqual([
      ["a", 10],
      ["b", 30],
    ]);
    expect(clock.now()).toBe(50);
  });

  test("same-deadline timers fire in registration order (seq tiebreak)", async () => {
    const clock = createVirtualClock();
    const fired: string[] = [];
    clock.setTimeout(() => fired.push("first"), 20);
    clock.setTimeout(() => fired.push("second"), 20);
    await clock.advance(20);
    expect(fired).toEqual(["first", "second"]);
  });

  test("a callback registering a same-instant timer gets it fired within the same advance", async () => {
    const clock = createVirtualClock();
    const fired: string[] = [];
    clock.setTimeout(() => {
      fired.push("outer@20");
      clock.setTimeout(() => fired.push("inner@0"), 0);
    }, 20);
    clock.setTimeout(() => fired.push("later@34"), 34);
    await clock.advance(50);
    // The 0ms timer lands at 21 (Node's >=1ms clamp), before the 34ms timer.
    expect(fired).toEqual(["outer@20", "inner@0", "later@34"]);
  });

  test("setTimeout(fn, 0) mirrors Node's >=1ms clamp", async () => {
    const clock = createVirtualClock();
    let firedAt = -1;
    clock.setTimeout(() => {
      firedAt = clock.now();
    }, 0);
    await clock.advance(5);
    expect(firedAt).toBe(1);
  });

  test("microtasks and nextTick callbacks drain between two fires", async () => {
    const clock = createVirtualClock();
    const order: string[] = [];
    clock.setTimeout(() => {
      order.push("t10");
      void Promise.resolve().then(() => order.push("microtask"));
      process.nextTick(() => order.push("nextTick"));
    }, 10);
    clock.setTimeout(() => order.push("t20"), 20);
    await clock.advance(30);
    expect(order).toEqual(["t10", "microtask", "nextTick", "t20"]);
  });

  test("a callback can cancel a later pending timer", async () => {
    const clock = createVirtualClock();
    const fired: string[] = [];
    const doomed = clock.setTimeout(() => fired.push("doomed"), 30);
    clock.setTimeout(() => {
      fired.push("canceller");
      clock.clearTimeout(doomed);
    }, 10);
    await clock.advance(50);
    expect(fired).toEqual(["canceller"]);
  });

  test("clearTimeout outside advance removes the timer from the ledger", async () => {
    const clock = createVirtualClock();
    let fired = false;
    const handle = clock.setTimeout(() => {
      fired = true;
    }, 10);
    clock.clearTimeout(handle);
    expect(clock.pendingTimers()).toHaveLength(0);
    await clock.advance(50);
    expect(fired).toBe(false);
  });

  test("a throwing callback rejects advance() with defined post-throw state", async () => {
    const clock = createVirtualClock();
    const fired: string[] = [];
    clock.setTimeout(() => {
      throw new Error("boom in timer");
    }, 10);
    clock.setTimeout(() => fired.push("survivor"), 30);
    await expect(clock.advance(50)).rejects.toThrow("boom in timer");
    // Virtual now rests at the throwing timer's due time; the ledger keeps
    // the remaining timer; the clock is not wedged.
    expect(clock.now()).toBe(10);
    expect(clock.pendingTimers()).toHaveLength(1);
    await clock.advance(40);
    expect(fired).toEqual(["survivor"]);
    expect(clock.now()).toBe(50);
  });

  test("a self-rescheduling zero-delay timer trips the runaway guard", async () => {
    const clock = createVirtualClock();
    function runaway() {
      clock.setTimeout(runaway, 0);
    }
    clock.setTimeout(runaway, 1);
    await expect(clock.advance(20_000)).rejects.toThrow(/runaway/);
  });

  test("pendingTimers() reports due time and registration order", () => {
    const clock = createVirtualClock();
    clock.setTimeout(function later() {}, 30);
    clock.setTimeout(function sooner() {}, 10);
    expect(clock.pendingTimers()).toEqual([
      { at: 10, seq: 1, name: "sooner" },
      { at: 30, seq: 0, name: "later" },
    ]);
  });

  test("drives the animation scheduler deterministically, observable via spies installed after construction", async () => {
    const clock = createVirtualClock();
    const scheduler = createAnimationScheduler(0, clock);
    const armSpy = vi.spyOn(clock, "setTimeout");
    const ticks: number[] = [];
    const { unsubscribe } = scheduler.subscribe((currentTime) => {
      ticks.push(currentTime);
    }, 100);
    // subscribe() must arm through the clock via property access at call
    // time, so the spy installed after createAnimationScheduler sees it.
    expect(armSpy).toHaveBeenCalledWith(expect.any(Function), 100);
    await clock.advance(350);
    // Ticks land exactly at each 100ms multiple of virtual time — no jitter,
    // no wall-clock dependence.
    expect(ticks).toEqual([100, 200, 300]);
    unsubscribe();
    scheduler.dispose();
    expect(clock.pendingTimers()).toHaveLength(0);
  });
});
