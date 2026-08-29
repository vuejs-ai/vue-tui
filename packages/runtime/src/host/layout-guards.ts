import Yoga from "yoga-layout";
import type { Direction, Node as YogaNode } from "yoga-layout";
import type { TuiBox, TuiNode, TuiRoot, TuiStatic, TuiText } from "./nodes.ts";
import { hasAuthoredFlexShrink } from "./yoga.ts";

type YogaCarrier = TuiRoot | TuiBox | TuiText | TuiStatic;
type ContainerWithChildren = TuiRoot | TuiBox | TuiText | TuiStatic;

// calculateLayoutWithContentGuards temporarily changes Yoga display state while
// the resulting layout is painted. Keep that renderer-owned state separate from
// the private raw-host display:none channel so paint-derived services do not
// report a zero-content guard as author-requested hidden state.
const activeContentGuards = new WeakSet<YogaNode>();

export function isContentLayoutGuarded(node: TuiNode): boolean {
  return hasYoga(node) && activeContentGuards.has(node.yoga);
}

function hasYoga(node: TuiNode): node is YogaCarrier {
  return (
    node.type === "root" ||
    node.type === "tui-box" ||
    node.type === "tui-text" ||
    node.type === "tui-static"
  );
}

function hasChildren(node: TuiNode): node is ContainerWithChildren {
  return (
    node.type === "root" ||
    node.type === "tui-box" ||
    node.type === "tui-text" ||
    node.type === "tui-static"
  );
}

function getBoxInnerSize(node: TuiBox): { width: number; height: number } {
  const layout = node.yoga.getComputedLayout();
  const width = Math.max(0, Math.floor(layout.width));
  const height = Math.max(0, Math.floor(layout.height));
  const left =
    node.yoga.getComputedBorder(Yoga.EDGE_LEFT) + node.yoga.getComputedPadding(Yoga.EDGE_LEFT);
  const right =
    node.yoga.getComputedBorder(Yoga.EDGE_RIGHT) + node.yoga.getComputedPadding(Yoga.EDGE_RIGHT);
  const top =
    node.yoga.getComputedBorder(Yoga.EDGE_TOP) + node.yoga.getComputedPadding(Yoga.EDGE_TOP);
  const bottom =
    node.yoga.getComputedBorder(Yoga.EDGE_BOTTOM) + node.yoga.getComputedPadding(Yoga.EDGE_BOTTOM);

  return {
    width: Math.max(0, Math.floor(width - left - right)),
    height: Math.max(0, Math.floor(height - top - bottom)),
  };
}

function hideYogaChild(child: TuiNode, guarded: Map<YogaNode, number>): boolean {
  if (!hasYoga(child)) return false;
  if (guarded.has(child.yoga)) return false;

  const display = child.yoga.getDisplay();
  if (display === Yoga.DISPLAY_NONE) return false;

  guarded.set(child.yoga, display);
  activeContentGuards.add(child.yoga);
  child.yoga.setDisplay(Yoga.DISPLAY_NONE);
  return true;
}

function applyZeroContentGuards(node: TuiNode, guarded: Map<YogaNode, number>): boolean {
  if (hasYoga(node) && node.yoga.getDisplay() === Yoga.DISPLAY_NONE) return false;

  let changed = false;
  if (node.type === "tui-box") {
    const inner = getBoxInnerSize(node);
    if (inner.width === 0 || inner.height === 0) {
      for (const child of node.children) {
        // Absolutely-positioned children are placed against their containing
        // block — the padding box (inside the borders) — not the content rect,
        // so the zero-content guard must not hide them; Ink lays them out and
        // paints them regardless.
        if (hasYoga(child) && child.yoga.getPositionType() === Yoga.POSITION_TYPE_ABSOLUTE) {
          continue;
        }
        changed = hideYogaChild(child, guarded) || changed;
      }
      return changed;
    }
  }

  if (!hasChildren(node)) return changed;
  for (const child of node.children) {
    changed = applyZeroContentGuards(child, guarded) || changed;
  }
  return changed;
}

/**
 * Keep a vertical stack from being squeezed below its own content.
 *
 * WORKAROUND for a Yoga feature gap; see the removal note at the end.
 *
 * CSS pairs `flex-shrink: 1` with `min-height: auto` — an automatic minimum
 * that stops a flex item from being squeezed below the size of its content.
 * Content that does not fit overflows the container and is clipped. Yoga
 * implements the shrinking and not the minimum, so a stack of items in a
 * container shorter than they are is compressed instead: each item receives a
 * fraction of a row, the fractions round, and every item that rounds to zero
 * disappears from the middle of the document.
 *
 * An item with no height of its own is already exactly as tall as its content,
 * so CSS's automatic minimum leaves it nothing to give up: "cannot shrink" is
 * the exact CSS answer for it, and that is the value supplied here. An item
 * sized larger than its content could give up the difference under CSS and
 * keeps it here, so it overflows and is clipped rather than losing rows.
 *
 * Only the vertical axis is guarded. A row squeezed past its content turns into
 * wrapped or truncated text, which keeps the content addressable, and `Table`
 * sizes its columns with exactly that. A column squeezed past its content has
 * no such fallback, because a terminal row cannot be partly drawn.
 *
 * An authored `flexShrink` is left alone: this supplies a default, it does not
 * override a decision.
 *
 * REMOVE THIS once the layout engine is Taffy, which implements the automatic
 * minimum size natively. Deleting `pinVerticalAxisAgainstShrinking`, its call
 * below, and `hasAuthoredFlexShrink` in `host/yoga.ts` restores plain
 * flex behavior with no other change.
 */
function pinVerticalAxisAgainstShrinking(node: TuiNode, pinned: Array<[YogaNode, number]>): void {
  if (!hasChildren(node)) return;
  const stacksVertically =
    hasYoga(node) &&
    (node.yoga.getFlexDirection() === Yoga.FLEX_DIRECTION_COLUMN ||
      node.yoga.getFlexDirection() === Yoga.FLEX_DIRECTION_COLUMN_REVERSE);

  for (const child of node.children) {
    if (stacksVertically && hasYoga(child)) {
      const yoga = child.yoga;
      // `TextProps` carries no `flexShrink`, so a text host's value is always the
      // one Text itself sets to shrink inside a no-wrap row — a horizontal
      // decision, never an authored vertical one.
      const authored = child.type !== "tui-text" && hasAuthoredFlexShrink(yoga);
      // Absolutely-positioned children are placed against the containing block
      // instead of being distributed along the main axis, so no free space is
      // taken from them and there is nothing to guard.
      if (
        yoga.getPositionType() !== Yoga.POSITION_TYPE_ABSOLUTE &&
        yoga.getFlexShrink() !== 0 &&
        !authored
      ) {
        pinned.push([yoga, yoga.getFlexShrink()]);
        yoga.setFlexShrink(0);
      }
    }
    pinVerticalAxisAgainstShrinking(child, pinned);
  }
}

export function calculateLayoutWithContentGuards(
  root: TuiRoot,
  width?: number,
  height?: number,
  direction: Direction = Yoga.DIRECTION_LTR,
): () => void {
  const guarded = new Map<YogaNode, number>();
  const pinned: Array<[YogaNode, number]> = [];
  pinVerticalAxisAgainstShrinking(root, pinned);
  // Restore in reverse insertion order so a parent hidden after its child is
  // un-hidden first — mirror of how the success closure restores.
  const restore = () => {
    for (const [node, display] of [...guarded].reverse()) {
      node.setDisplay(display);
      activeContentGuards.delete(node);
    }
    for (const [node, flexShrink] of pinned) node.setFlexShrink(flexShrink);
    pinned.length = 0;
  };

  try {
    for (;;) {
      root.yoga.calculateLayout(width, height, direction);
      if (!applyZeroContentGuards(root, guarded)) break;
    }
  } catch (err) {
    // WHY: nodes are hidden (setDisplay DISPLAY_NONE) INSIDE the loop, but the
    // restore closure is only handed back on the normal path. If a later
    // iteration's calculateLayout (or a measure func it invokes) throws after an
    // earlier iteration already hid one or more nodes, the throw would leak that
    // DISPLAY_NONE onto the LIVE yoga tree — applyZeroContentGuards treats any
    // already-DISPLAY_NONE node as legitimately hidden, so it is never un-hidden
    // and the subtree stays permanently invisible. The callers' try/finally
    // can't help: the closure was never returned. Un-hide what we hid before
    // propagating, leaving the tree clean. The original error is rethrown as-is.
    restore();
    throw err;
  }

  return restore;
}
