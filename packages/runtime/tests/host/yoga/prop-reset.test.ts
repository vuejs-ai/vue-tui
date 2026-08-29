import { expect, test } from "vite-plus/test";
// Keep the stable Yoga enum values local and inspect computed layout through the
// node, so the test stays focused on Runtime's prop reconciliation behavior.
import {
  applyYogaProp,
  attachYoga,
  detachYoga,
  reconcileMarginEdges,
  reconcilePaddingEdges,
} from "../../../src/host/yoga.ts";
import { createBox } from "../../../src/host/nodes.ts";

// yoga-layout YGEnums (generated/YGEnums.ts) — stable values.
const EDGE_LEFT = 0;
const EDGE_TOP = 1;
const DIRECTION_LTR = 1;
// Display enum (YGEnums Display): Flex=0 (default/visible), None=1 (hidden).
const DISPLAY_FLEX = 0;
const DISPLAY_NONE = 1;

// Blocker 2: Vue's HOST renderer passes next=null (not undefined) when a key
// disappears from a spread props object (e.g. Static spreads `style` into host
// props). The removal reset path must treat null the same as undefined so a
// removed yoga key resets to its documented default instead of writing NaN/0.
//
// NOTE on layer: margin/padding edges are reconciled from the FULL el.props by
// reconcileMarginEdges / reconcilePaddingEdges (their per-prop yoga setters are
// no-ops — an edge depends on the specific edge + axis + all-edges shorthands
// together). So these tests drive the reconcilers directly with the el.props
// patchProp would have stored (a removed key is null/undefined → treated as
// absent by the reconciler), mirroring the border reconcile pattern. display (a
// single-prop reset) still goes through applyYogaProp below.

function freshBox() {
  const box = createBox();
  attachYoga(box);
  return box;
}

test("null removal of marginTop resets to default (Blocker 2)", () => {
  const box = freshBox();
  reconcileMarginEdges(box, { marginTop: 4 });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(4);

  // Removal arrives as null in el.props (key removed from a spread props object);
  // the reconciler treats null/undefined as absent → edge falls back to 0.
  reconcileMarginEdges(box, { marginTop: null });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(0);

  detachYoga(box);
});

test("null removal of paddingLeft resets to default (Blocker 2)", () => {
  const box = freshBox();
  reconcilePaddingEdges(box, { paddingLeft: 5 });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(5);

  reconcilePaddingEdges(box, { paddingLeft: null });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(0);

  detachYoga(box);
});

test("raw null does not corrupt a yoga dimension to NaN (Blocker 2)", () => {
  const box = freshBox();
  reconcileMarginEdges(box, { marginTop: 7 });
  // Removal arrives as null; must reset to 0, never NaN.
  reconcileMarginEdges(box, { marginTop: null });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  const m = box.yoga.getComputedMargin(EDGE_TOP as never);
  expect(Number.isNaN(m)).toBe(false);
  expect(m).toBe(0);
  detachYoga(box);
});

// A withdrawn more-specific edge falls back to the surviving shorthand.
// EDGE_TOP overrides EDGE_ALL even at 0, so family reconciliation must recompute
// the physical edge instead of assigning a reset value in isolation.

test("withdrawn marginTop falls back to surviving margin shorthand, not 0", () => {
  const box = freshBox();
  reconcileMarginEdges(box, { margin: 5, marginTop: 8 });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(8);

  // marginTop removed (null in el.props); top must fall back to margin=5, NOT 0.
  reconcileMarginEdges(box, { margin: 5, marginTop: null });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(5);

  detachYoga(box);
});

test("withdrawn paddingLeft falls back to surviving padding shorthand, not 0", () => {
  const box = freshBox();
  reconcilePaddingEdges(box, { padding: 4, paddingLeft: 7 });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(7);

  reconcilePaddingEdges(box, { padding: 4, paddingLeft: null });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(4);

  detachYoga(box);
});

// A non-finite numeric edge is absent during precedence resolution, so the next
// finite axis or all-edges shorthand supplies the physical edge.

test("non-finite marginTop (NaN) falls through to surviving margin shorthand, not 0", () => {
  const box = freshBox();
  reconcileMarginEdges(box, { margin: 5, marginTop: NaN });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(5);

  detachYoga(box);
});

test("non-finite paddingLeft (NaN) falls through to surviving padding shorthand, not 0", () => {
  const box = freshBox();
  reconcilePaddingEdges(box, { padding: 5, paddingLeft: NaN });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(5);

  detachYoga(box);
});

// Explicit zero is finite and therefore overrides a shorthand.

test("explicit marginTop=0 overrides the margin shorthand → top is 0, not 5", () => {
  const box = freshBox();
  reconcileMarginEdges(box, { margin: 5, marginTop: 0 });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(0);

  detachYoga(box);
});

// --- Spacing value contract ---
//
// Spacing props are typed `number`. An edge resolves only from a finite number,
// with one accommodation for Vue templates: a static numeric attribute such as
// `<Box margin="5">` arrives as a numeric string and resolves to 5. Other strings
// are absent during precedence resolution and fall through to a surviving
// shorthand.

test('numeric string margin="5" resolves to 5 (static template attribute ergonomics)', () => {
  const box = freshBox();
  // `<Box margin="5">` reaches the host renderer as the string "5"; the family
  // recompute coerces it like the numeric prop margin={5}.
  reconcileMarginEdges(box, { margin: "5" });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(5);
  expect(box.yoga.getComputedMargin(EDGE_LEFT as never)).toBe(5);

  detachYoga(box);
});

test('numeric string marginTop="8" resolves to 8 and overrides the shorthand', () => {
  const box = freshBox();
  reconcileMarginEdges(box, { margin: 5, marginTop: "8" });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(8);

  detachYoga(box);
});

test('non-numeric string marginTop="50%" follows the number-only contract', () => {
  const box = freshBox();
  reconcileMarginEdges(box, { margin: 5, marginTop: "50%" });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(5);

  detachYoga(box);
});

test('non-numeric string paddingLeft="50%" follows the number-only contract', () => {
  const box = freshBox();
  reconcilePaddingEdges(box, { padding: 4, paddingLeft: "50%" });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(4);

  detachYoga(box);
});

test('junk string marginTop="foo" follows the number-only contract', () => {
  const box = freshBox();
  expect(() => {
    reconcileMarginEdges(box, { margin: 5, marginTop: "foo" });
  }).not.toThrow();
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(5);

  detachYoga(box);
});

// Empty strings are non-numeric input rather than an explicit zero.

test('empty string marginTop="" follows the number-only contract', () => {
  const box = freshBox();
  reconcileMarginEdges(box, { margin: 5, marginTop: "" });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(5);

  detachYoga(box);
});

test('empty string paddingLeft="" follows the number-only contract', () => {
  const box = freshBox();
  reconcilePaddingEdges(box, { padding: 4, paddingLeft: "" });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(4);

  detachYoga(box);
});

// Removing or undefining `display` resets to the visible DISPLAY_FLEX default.
// These tests pin the Yoga-level reset directly through getDisplay().

test("removing display=none resets to DISPLAY_FLEX instead of retaining DISPLAY_NONE", () => {
  const box = freshBox();
  applyYogaProp(box, "display", "none", undefined);
  expect(box.yoga.getDisplay()).toBe(DISPLAY_NONE);

  // Removal: prev="none", next=undefined → reset to the default (visible).
  applyYogaProp(box, "display", undefined, "none");
  expect(box.yoga.getDisplay()).toBe(DISPLAY_FLEX);

  detachYoga(box);
});

test("null removal of display=none also resets to DISPLAY_FLEX (spread-props path)", () => {
  const box = freshBox();
  applyYogaProp(box, "display", "none", undefined);
  expect(box.yoga.getDisplay()).toBe(DISPLAY_NONE);

  // Vue's host renderer passes next=null when a key vanishes from a spread props
  // object; the `value == null` reset path must treat it like undefined.
  applyYogaProp(box, "display", null, "none");
  expect(box.yoga.getDisplay()).toBe(DISPLAY_FLEX);

  detachYoga(box);
});

test("absent-on-mount display does not force a reset write", () => {
  // Guard check: on first mount Vue emits patchProp(el, 'display', null/undefined,
  // undefined) for an unset prop. With no prior real value the reset must NOT
  // fire — the node keeps yoga's default (DISPLAY_FLEX) regardless, so this only
  // confirms the absent path is inert and never lands on DISPLAY_NONE.
  const box = freshBox();
  applyYogaProp(box, "display", undefined, undefined);
  expect(box.yoga.getDisplay()).toBe(DISPLAY_FLEX);
  applyYogaProp(box, "display", null, undefined);
  expect(box.yoga.getDisplay()).toBe(DISPLAY_FLEX);
  detachYoga(box);
});
