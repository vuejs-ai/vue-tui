import { expect, test } from "vite-plus/test";
// Keep the stable Yoga enum values local so this regression focuses on
// Runtime's guard behavior rather than Yoga's generated enum surface.
import {
  isContentLayoutGuarded,
  runLayoutTransaction,
} from "../../../src/host/layout-transaction.ts";
import { attachYoga, detachYoga } from "../../../src/host/yoga.ts";
import { createBox, createRoot, createText } from "../../../src/host/nodes.ts";
import type { AppContext } from "../../../src/context.ts";

// yoga-layout YGEnums (generated/YGEnums.ts) — Display: Flex=0 (visible), None=1.
const DISPLAY_NONE = 1;

// A guard iteration may hide flow nodes before a later Yoga call throws. The
// transaction restores every guarded display value before rethrowing the error.
test("a throw on a later layout iteration restores nodes hidden by an earlier iteration", () => {
  // Minimal AppContext stand-in — the guard code never reads it.
  const root = createRoot({} as AppContext);
  attachYoga(root);

  // --- Iteration-1 hide: a zero-inner-size box whose visible child is hidden by
  //     the zero-content guard. The hide makes applyZeroContentGuards return
  //     `changed=true`, so the for(;;) loop runs calculateLayout a SECOND time. ---
  const zeroBox = createBox();
  attachYoga(zeroBox);
  zeroBox.parent = root;
  root.children.push(zeroBox);
  // width 0 → zero inner content size → guard hides relative children.
  zeroBox.yoga.setWidth(0);
  root.yoga.insertChild(zeroBox.yoga, 0);

  const hiddenChild = createBox();
  attachYoga(hiddenChild);
  hiddenChild.parent = zeroBox;
  zeroBox.children.push(hiddenChild);
  // A real size so it starts visible (DISPLAY_FLEX) — a genuine hide candidate.
  hiddenChild.yoga.setWidth(5);
  hiddenChild.yoga.setHeight(1);
  zeroBox.yoga.insertChild(hiddenChild.yoga, 0);

  // --- Iteration-2 throw: a separate VISIBLE leaf whose measure func succeeds
  //     on its first invocation and throws on its second. Iteration 1 measures
  //     it OK (the guard then hides hiddenChild → loop again); iteration 2
  //     re-measures it and throws. A hidden node's measure func is never called,
  //     so the throwing node must stay visible — hence a separate root child. ---
  const measuredText = createText();
  attachYoga(measuredText);
  measuredText.parent = root;
  root.children.push(measuredText);
  root.yoga.insertChild(measuredText.yoga, 1);

  let measureCalls = 0;
  const boom = new Error("measure exploded on the second layout pass");
  measuredText.yoga.setMeasureFunc(() => {
    measureCalls++;
    if (measureCalls >= 2) throw boom;
    return { width: 4, height: 1 };
  });

  // Yoga caches a clean leaf's measurement and only re-measures when the leaf is
  // dirty or its available width changes. Hiding hiddenChild (a grandchild in a
  // degenerate box) changes neither for measuredText, so without this yoga would
  // not re-measure it on iteration 2 and the throw could never reach a later
  // pass. We mark it dirty before each calculateLayout to force the per-iteration
  // re-measure — this only defeats caching; the hide and the throw remain real
  // and in the correct order (hide in iteration 1, throw in iteration 2).
  //
  // We also count the OUTER guard-loop iterations here and snapshot whether the
  // iteration-1 hide had already landed when the throwing pass began — so the
  // test proves the throw struck a LATER iteration (after a real hide), not a
  // second internal measure pass within the first calculateLayout.
  let outerLayoutCalls = 0;
  let hiddenWasAlreadyHiddenWhenThrowingPassBegan = false;
  const realCalculateLayout = root.yoga.calculateLayout.bind(root.yoga);
  // Override the bound method on this one yoga node only (test-local seam).
  (root.yoga as { calculateLayout: (...args: unknown[]) => unknown }).calculateLayout = (
    ...args: unknown[]
  ) => {
    outerLayoutCalls++;
    if (measureCalls >= 1) {
      // This is the pass that will throw (measure func throws on call #2);
      // record whether iteration 1 already hid the child before this pass runs.
      hiddenWasAlreadyHiddenWhenThrowingPassBegan = hiddenChild.yoga.getDisplay() === DISPLAY_NONE;
    }
    measuredText.yoga.markDirty();
    return realCalculateLayout(...(args as Parameters<typeof realCalculateLayout>));
  };

  try {
    // Sanity: nothing is hidden before layout runs.
    expect(hiddenChild.yoga.getDisplay()).not.toBe(DISPLAY_NONE);

    // The measure error propagates unchanged.
    expect(() =>
      runLayoutTransaction({
        dynamicRoot: root,
        staticRoots: [],
        columns: 80,
        dynamicHeight: { mode: "exact", rows: 24 },
      }),
    ).toThrow(boom);

    // The throw genuinely happened on a LATER outer iteration (the loop ran
    // calculateLayout at least twice), not within the first pass.
    expect(outerLayoutCalls).toBeGreaterThanOrEqual(2);
    expect(measureCalls).toBeGreaterThanOrEqual(2);
    // ...and the iteration-1 hide had already landed on the live tree when the
    // throwing pass started — so there was genuinely something to leak.
    expect(hiddenWasAlreadyHiddenWhenThrowingPassBegan).toBe(true);

    // The node hidden in iteration 1 is restored before the error escapes.
    expect(hiddenChild.yoga.getDisplay()).not.toBe(DISPLAY_NONE);
    expect(isContentLayoutGuarded(hiddenChild)).toBe(false);
  } finally {
    root.yoga.removeChild(measuredText.yoga);
    detachYoga(measuredText);
    root.yoga.freeRecursive();
  }
});

test("temporary content guards are observable only until the layout restore", () => {
  const root = createRoot({} as AppContext);
  attachYoga(root);
  const zeroBox = createBox();
  attachYoga(zeroBox);
  zeroBox.parent = root;
  zeroBox.yoga.setWidth(0);
  zeroBox.yoga.setHeight(1);
  root.children.push(zeroBox);
  root.yoga.insertChild(zeroBox.yoga, 0);

  const child = createBox();
  attachYoga(child);
  child.parent = zeroBox;
  child.yoga.setWidth(2);
  child.yoga.setHeight(1);
  zeroBox.children.push(child);
  zeroBox.yoga.insertChild(child.yoga, 0);

  const layout = runLayoutTransaction({
    dynamicRoot: root,
    staticRoots: [],
    columns: 10,
    dynamicHeight: { mode: "exact", rows: 2 },
  });
  expect(child.yoga.getDisplay()).toBe(DISPLAY_NONE);
  expect(isContentLayoutGuarded(child)).toBe(true);

  layout.dispose();
  expect(child.yoga.getDisplay()).not.toBe(DISPLAY_NONE);
  expect(isContentLayoutGuarded(child)).toBe(false);
});
