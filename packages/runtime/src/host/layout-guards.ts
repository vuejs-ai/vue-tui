import Yoga from "yoga-layout";
import type { Direction, Node as YogaNode } from "yoga-layout";
import type { TuiBox, TuiNode, TuiRoot, TuiStatic, TuiText } from "./nodes.ts";

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
 * Lay out against a page's row bound while the root's auto-sized in-flow children
 * keep their natural height.
 *
 * The document hosts — `renderToString()` and the mounted non-TTY host — model one
 * finite page, and a child the author gave an explicit height is fitted to it as
 * asked. A child with no height of its own has nothing to fit: shrinking it only
 * collapses the content inside it, so the document would lose rows from its middle
 * instead of overflowing the page and being clipped from row zero.
 *
 * Only style inputs decide this — no measured value is read back into layout.
 */
export function calculateBoundedLayoutWithContentGuards(
  root: TuiRoot,
  width: number | undefined,
  height: number,
): () => void {
  const pinned: Array<[YogaNode, number]> = [];
  for (const child of root.children) {
    if (!hasYoga(child)) continue;
    const node = child.yoga;
    if (node.getPositionType() === Yoga.POSITION_TYPE_ABSOLUTE) continue;
    if (node.getHeight().unit !== Yoga.UNIT_AUTO) continue;
    if (node.getFlexBasis().unit !== Yoga.UNIT_AUTO) continue;
    pinned.push([node, node.getFlexShrink()]);
    node.setFlexShrink(0);
  }
  const restorePinned = () => {
    for (const [node, flexShrink] of pinned) node.setFlexShrink(flexShrink);
    pinned.length = 0;
  };

  let restoreGuards: () => void;
  try {
    restoreGuards = calculateLayoutWithContentGuards(root, width, height);
  } catch (error) {
    restorePinned();
    throw error;
  }

  return () => {
    restoreGuards();
    restorePinned();
  };
}

export function calculateLayoutWithContentGuards(
  root: TuiRoot,
  width?: number,
  height?: number,
  direction: Direction = Yoga.DIRECTION_LTR,
): () => void {
  const guarded = new Map<YogaNode, number>();
  // Restore in reverse insertion order so a parent hidden after its child is
  // un-hidden first — mirror of how the success closure restores.
  const restore = () => {
    for (const [node, display] of [...guarded].reverse()) {
      node.setDisplay(display);
      activeContentGuards.delete(node);
    }
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
