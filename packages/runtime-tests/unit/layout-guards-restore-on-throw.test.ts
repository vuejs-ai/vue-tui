import { expect, test } from "vite-plus/test";
// Internal modules not in package exports — import via relative source path,
// matching the convention in unit/yoga-prop-reset.test.ts. yoga-layout is a
// dependency of @vue-tui/runtime (not of runtime-tests), so we reference the
// stable yoga enum value numerically rather than importing it here.
import { calculateLayoutWithContentGuards } from "../../runtime/src/host/layout-guards.ts";
import { attachYoga } from "../../runtime/src/host/yoga.ts";
import { createBox, createRoot, createText } from "../../runtime/src/host/nodes.ts";
import type { AppContext } from "../../runtime/src/context.ts";

// yoga-layout YGEnums (generated/YGEnums.ts) — Display: Flex=0 (visible), None=1.
const DISPLAY_NONE = 1;
const DIRECTION_LTR = 1;

// Regression: calculateLayoutWithContentGuards hides zero-content nodes
// (setDisplay DISPLAY_NONE, prior display recorded in `guarded`) INSIDE its
// for(;;) loop, then returns a restore closure on the NORMAL path only. If a
// later loop iteration's calculateLayout throws — AFTER an earlier iteration
// already hid a node — the function used to throw BEFORE returning that closure,
// leaving the hidden node DISPLAY_NONE on the LIVE yoga tree forever:
// applyZeroContentGuards short-circuits any DISPLAY_NONE node on the next
// commit, so it is never un-hidden and the subtree stays permanently invisible
// even after the offending input is gone. The two callers wrap the RETURNED
// closure in try/finally, but that cannot help — the closure was never handed
// back. The fix restores everything in `guarded` (reverse order) on the way out
// before re-throwing, leaving the tree clean and propagating the original error.
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

  // Sanity: nothing is hidden before layout runs.
  expect(hiddenChild.yoga.getDisplay()).not.toBe(DISPLAY_NONE);

  // The original measure error must propagate UNCHANGED.
  expect(() => calculateLayoutWithContentGuards(root, 80, 24, DIRECTION_LTR as never)).toThrow(
    boom,
  );

  // The throw genuinely happened on a LATER outer iteration (the loop ran
  // calculateLayout at least twice), not within the first pass.
  expect(outerLayoutCalls).toBeGreaterThanOrEqual(2);
  expect(measureCalls).toBeGreaterThanOrEqual(2);
  // ...and the iteration-1 hide had already landed on the live tree when the
  // throwing pass started — so there was genuinely something to leak.
  expect(hiddenWasAlreadyHiddenWhenThrowingPassBegan).toBe(true);

  // The bug: the node hidden in iteration 1 must NOT be left DISPLAY_NONE on the
  // live yoga tree. Before the fix this fails (it stays hidden forever); after
  // the fix the catch restores it before re-throwing.
  expect(hiddenChild.yoga.getDisplay()).not.toBe(DISPLAY_NONE);
});
