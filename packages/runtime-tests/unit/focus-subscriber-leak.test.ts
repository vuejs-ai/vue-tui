import { expect, test, vi } from "vite-plus/test";
import { createFocusController } from "@vue-tui/runtime/internal";

// Regression: createFocusController()'s subscribe() returned an unsubscribe that
// did `set.delete(fn)` but never removed the now-empty Set from the `subs` Map.
// useFocus() with no explicit id mints a fresh `__auto-N` id per mount, so every
// mount/unmount of a no-id focusable permanently leaked one empty-Set Map entry —
// unbounded growth over a long session. The fix drops the empty Set on the last
// unsubscribe. These tests reach the internal Map via the `__subscriberMapSize`
// probe on the controller (test-only; see internal.ts / render.ts).
//
// Imported from the built `@vue-tui/runtime/internal` dist (not source): render.ts
// transitively imports .vue SFCs, which the runtime-tests vitest config does not
// compile (no @vitejs/plugin-vue), so this must reach the factory via the dist.

test("subscribing/unsubscribing many auto-id focusables does not grow the subscriber Map", () => {
  const ctx = createFocusController();
  const baseline = ctx.__subscriberMapSize();
  expect(baseline).toBe(0);

  // Simulate 300 mount/unmount cycles of a no-id useFocus(): each mints a unique
  // `__auto-N` id, subscribes once, then unsubscribes on unmount.
  for (let i = 0; i < 300; i++) {
    const unsubscribe = ctx.subscribe(`__auto-${i}`, () => {});
    unsubscribe();
  }

  // After the fix the Map returns to baseline; before the fix it had grown by 300.
  expect(ctx.__subscriberMapSize()).toBe(baseline);
});

test("focus delivery still works: subscribe receives notify, and re-subscribe after the Set was dropped re-creates it", () => {
  const ctx = createFocusController();
  const received: boolean[] = [];

  // Register a focusable and subscribe; activate so Tab/programmatic focus can land.
  ctx.add("only", { autoFocus: false });
  ctx.activate("only");
  const unsubscribe = ctx.subscribe("only", (focused) => received.push(focused));
  expect(ctx.__subscriberMapSize()).toBe(1);

  // Programmatic focus delivers a `true` notification.
  ctx.focus("only");
  expect(received).toEqual([true]);

  // Unsubscribe drops the empty Set (last subscriber gone). Blur first so the
  // controller is back to no-active-focus before we re-subscribe (otherwise the
  // re-subscriber would later see a `false` blur notification for the prior focus).
  ctx.blur();
  unsubscribe();
  expect(ctx.__subscriberMapSize()).toBe(0);

  // Re-subscribing for the same id must re-create the Set and still deliver.
  const received2: boolean[] = [];
  ctx.subscribe("only", (focused) => received2.push(focused));
  expect(ctx.__subscriberMapSize()).toBe(1);

  // Re-focus to drive a fresh notification to the new subscriber.
  ctx.focus("only");
  expect(received2).toEqual([true]);
});

test("a stale double-unsubscribe after re-subscribe does not drop the fresh subscriber's Set", () => {
  // The empty-Set cleanup must only delete the Set the closure actually owns.
  // Without the `subs.get(id) === set` identity guard, calling an old unsubscribe
  // a second time (after a new subscribe(id) re-created the Set) would delete the
  // FRESH Map entry and silently kill the new subscriber's notifications.
  const ctx = createFocusController();

  const unsubscribeOld = ctx.subscribe("x", () => {});
  unsubscribeOld(); // drops the old (now-empty) Set from the Map
  expect(ctx.__subscriberMapSize()).toBe(0);

  const received: boolean[] = [];
  ctx.subscribe("x", (focused) => received.push(focused)); // fresh Set
  expect(ctx.__subscriberMapSize()).toBe(1);

  // Stale call to the OLD unsubscribe — must be a no-op for the fresh Set.
  unsubscribeOld();
  expect(ctx.__subscriberMapSize()).toBe(1);

  // The fresh subscriber still receives notifications.
  ctx.add("x", { autoFocus: false });
  ctx.activate("x");
  ctx.focus("x");
  expect(received).toEqual([true]);
});

test("a Set with multiple live subscribers is kept until the last one unsubscribes", () => {
  // Duplicate-id case: two consumers share one id's Set. Removing one must not
  // silence the survivor, and the Map entry must persist while either is live.
  const ctx = createFocusController();
  const a = vi.fn();
  const b = vi.fn();

  const unsubA = ctx.subscribe("dup", a);
  const unsubB = ctx.subscribe("dup", b);
  expect(ctx.__subscriberMapSize()).toBe(1);

  unsubA();
  // b is still live → Set (and Map entry) must remain.
  expect(ctx.__subscriberMapSize()).toBe(1);

  ctx.add("dup", { autoFocus: false });
  ctx.activate("dup");
  ctx.focus("dup");
  expect(a).not.toHaveBeenCalled();
  expect(b).toHaveBeenCalledWith(true);

  unsubB();
  expect(ctx.__subscriberMapSize()).toBe(0);
});
