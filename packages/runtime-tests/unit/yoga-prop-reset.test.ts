import { expect, test } from "vite-plus/test";
// Internal modules not in package exports — import via relative source path,
// matching the convention in unit/animation-scheduler.sequential.test.ts.
// NOTE: yoga-layout is a dependency of @vue-tui/runtime, not of runtime-tests,
// so it cannot be imported here directly. We reference the stable yoga enum
// values numerically (EDGE_LEFT=0, EDGE_TOP=1, DIRECTION_LTR=1) and inspect the
// computed layout via the node's own getComputedMargin/Padding.
import { applyYogaProp, attachYoga, detachYoga } from "../../runtime/src/host/yoga.ts";
import { createBox } from "../../runtime/src/host/nodes.ts";

// yoga-layout YGEnums (generated/YGEnums.ts) — stable values.
const EDGE_LEFT = 0;
const EDGE_TOP = 1;
const DIRECTION_LTR = 1;

// Blocker 2: Vue's HOST renderer passes next=null (not undefined) when a key
// disappears from a spread props object (e.g. Static spreads `style` into host
// props). applyYogaProp's reset path must treat null the same as undefined so a
// removed yoga key resets to its documented default instead of writing NaN/0.

function freshBox() {
  const box = createBox();
  attachYoga(box);
  return box;
}

test("null removal of marginTop resets to default (Blocker 2)", () => {
  const box = freshBox();
  applyYogaProp(box, "marginTop", 4, undefined);
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(4);

  // Removal arrives as next=null (key removed from a spread props object).
  applyYogaProp(box, "marginTop", null, 4);
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(0);

  detachYoga(box);
});

test("null removal of paddingLeft resets to default (Blocker 2)", () => {
  const box = freshBox();
  applyYogaProp(box, "paddingLeft", 5, undefined);
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(5);

  applyYogaProp(box, "paddingLeft", null, 5);
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(0);

  detachYoga(box);
});

test("raw null does not corrupt a yoga dimension to NaN (Blocker 2)", () => {
  const box = freshBox();
  applyYogaProp(box, "marginTop", 7, undefined);
  // Removal arrives as null; must reset to 0, never NaN.
  applyYogaProp(box, "marginTop", null, 7);
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  const m = box.yoga.getComputedMargin(EDGE_TOP as never);
  expect(Number.isNaN(m)).toBe(false);
  expect(m).toBe(0);
  detachYoga(box);
});
