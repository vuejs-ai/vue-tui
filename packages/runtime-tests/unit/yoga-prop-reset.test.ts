import { expect, test } from "vite-plus/test";
// Internal modules not in package exports — import via relative source path,
// matching the convention in unit/animation-scheduler.sequential.test.ts.
// NOTE: better-yoga-layout is a dependency of @vue-tui/runtime, not of
// runtime-tests, so it cannot be imported here directly. We reference the stable
// yoga enum values numerically (EDGE_LEFT=0, EDGE_TOP=1, DIRECTION_LTR=1) and
// inspect the computed layout via the node's own getComputedMargin/Padding.
import {
  applyYogaProp,
  attachYoga,
  detachYoga,
  reconcileMarginEdges,
  reconcilePaddingEdges,
} from "../../runtime/src/host/yoga.ts";
import { createBox } from "../../runtime/src/host/nodes.ts";

// better-yoga-layout YGEnums (generated/YGEnums.ts) — stable values.
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

// Family-recompute fallback: a withdrawn more-specific edge must fall back to the
// surviving shorthand, NOT collapse to 0 (the bug). EDGE_TOP overrides EDGE_ALL
// even at 0, so the old per-setter reset to 0 beat a surviving margin={5}. (G19)

test("withdrawn marginTop falls back to surviving margin shorthand, not 0 (G19)", () => {
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

test("withdrawn paddingLeft falls back to surviving padding shorthand, not 0 (G19)", () => {
  const box = freshBox();
  reconcilePaddingEdges(box, { padding: 4, paddingLeft: 7 });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(7);

  reconcilePaddingEdges(box, { padding: 4, paddingLeft: null });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(4);

  detachYoga(box);
});

// Non-finite numeric edge (NaN/±Infinity, e.g. a user calc like 0/0): the OLD
// per-setter code did setMargin(EDGE_TOP, NaN), which yoga treats as unset so the
// edge fell back to the surviving shorthand → top = margin = 5. The reconcile must
// preserve that by treating a present-but-non-finite value as ABSENT and falling
// THROUGH to the next precedence level (axis → all → 0), not resolving it to 0.

test("non-finite marginTop (NaN) falls through to surviving margin shorthand, not 0 (G19)", () => {
  const box = freshBox();
  reconcileMarginEdges(box, { margin: 5, marginTop: NaN });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(5);

  detachYoga(box);
});

test("non-finite paddingLeft (NaN) falls through to surviving padding shorthand, not 0 (G19)", () => {
  const box = freshBox();
  reconcilePaddingEdges(box, { padding: 5, paddingLeft: NaN });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(5);

  detachYoga(box);
});

// Explicit zero is NOT non-finite — Number(0) is finite — so an explicit edge
// override of 0 must STILL win over the shorthand (resolve to 0), distinct from
// the NaN fall-through above.

test("explicit marginTop=0 overrides the margin shorthand → top is 0, not 5 (G19)", () => {
  const box = freshBox();
  reconcileMarginEdges(box, { margin: 5, marginTop: 0 });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(0);

  detachYoga(box);
});

// --- spacing value contract (PR #184) ------------------------------------
//
// Spacing props are typed `number` (box-props.ts) and Ink's margin/padding are
// number-only. The family recompute resolves an edge from a value only when it
// coerces to a FINITE number, with one carve-out for template ergonomics: a Vue
// STATIC template attribute (`<Box margin="5">`) arrives as the numeric STRING
// "5", which must still resolve to 5. Any OTHER non-numeric value ("50%", "foo",
// "") is treated as not-set and falls through to the surviving shorthand — the
// reconcile drops the OLD per-setter code's incidental, off-contract string
// forwarding (setMargin(edge, "50%") → yoga percent; setMargin(edge, "foo") →
// throw). These pin that contract so it can't silently drift.

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

test('non-numeric string marginTop="50%" falls through to the surviving margin shorthand (PR #184: no longer a yoga percent)', () => {
  const box = freshBox();
  // OLD per-setter code forwarded "50%" raw → yoga read it as a 50% percent
  // margin. The typed contract is number-only, so "50%" is now off-contract /
  // not-set and the edge falls back to the surviving margin shorthand.
  reconcileMarginEdges(box, { margin: 5, marginTop: "50%" });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(5);

  detachYoga(box);
});

test('non-numeric string paddingLeft="50%" falls through to the surviving padding shorthand (PR #184: no longer a yoga percent)', () => {
  const box = freshBox();
  reconcilePaddingEdges(box, { padding: 4, paddingLeft: "50%" });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(4);

  detachYoga(box);
});

test('junk string marginTop="foo" falls through to the surviving margin shorthand (PR #184: no longer throws)', () => {
  const box = freshBox();
  // OLD per-setter code did setMargin(EDGE_TOP, "foo") which threw; now it is
  // not-set and falls back to the shorthand without throwing.
  expect(() => {
    reconcileMarginEdges(box, { margin: 5, marginTop: "foo" });
  }).not.toThrow();
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(5);

  detachYoga(box);
});

// Empty-string tweak (PR #184): `Number("") === 0` would otherwise make
// marginTop="" resolve to 0 (overriding the shorthand) while every other
// non-numeric string falls through — `present()` excludes "" so the contract is
// uniform: only numeric strings are coerced, all other strings fall through.

test('empty string marginTop="" falls through to the surviving margin shorthand, not 0 (PR #184 "" tweak)', () => {
  const box = freshBox();
  reconcileMarginEdges(box, { margin: 5, marginTop: "" });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedMargin(EDGE_TOP as never)).toBe(5);

  detachYoga(box);
});

test('empty string paddingLeft="" falls through to the surviving padding shorthand, not 0 (PR #184 "" tweak)', () => {
  const box = freshBox();
  reconcilePaddingEdges(box, { padding: 4, paddingLeft: "" });
  box.yoga.calculateLayout(undefined, undefined, DIRECTION_LTR as never);
  expect(box.yoga.getComputedPadding(EDGE_LEFT as never)).toBe(4);

  detachYoga(box);
});

// display: removing/undefining `display` resets to the DEFAULT (DISPLAY_FLEX =
// visible), a DELIBERATE divergence from Ink (which hides on present-undefined).
// See .agents/docs/ink-divergences.md ("Removing `display` resets to the
// default"). These pin the yoga-level reset directly via getDisplay().

test("removing display=none resets to DISPLAY_FLEX, not stale DISPLAY_NONE (display divergence)", () => {
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

test("absent-on-mount display (prev=null/undefined) does not force a reset write (display divergence)", () => {
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
