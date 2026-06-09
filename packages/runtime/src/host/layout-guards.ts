import Yoga from "yoga-layout";
import type { Direction, Node as YogaNode } from "yoga-layout";
import type { TuiBox, TuiNode, TuiRoot, TuiStatic, TuiText, TuiTransform } from "./nodes.ts";

type YogaCarrier = TuiRoot | TuiBox | TuiText | TuiStatic | TuiTransform;
type ContainerWithChildren = TuiRoot | TuiBox | TuiText | TuiStatic | TuiTransform;

function hasYoga(node: TuiNode): node is YogaCarrier {
  return (
    node.type === "root" ||
    node.type === "box" ||
    node.type === "text" ||
    node.type === "static" ||
    node.type === "transform"
  );
}

function hasChildren(node: TuiNode): node is ContainerWithChildren {
  return (
    node.type === "root" ||
    node.type === "box" ||
    node.type === "text" ||
    node.type === "static" ||
    node.type === "transform"
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
  child.yoga.setDisplay(Yoga.DISPLAY_NONE);
  return true;
}

function applyZeroContentGuards(node: TuiNode, guarded: Map<YogaNode, number>): boolean {
  if (hasYoga(node) && node.yoga.getDisplay() === Yoga.DISPLAY_NONE) return false;

  let changed = false;
  if (node.type === "box") {
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

export function calculateLayoutWithContentGuards(
  root: TuiRoot,
  width?: number,
  height?: number,
  direction: Direction = Yoga.DIRECTION_LTR,
): () => void {
  const guarded = new Map<YogaNode, number>();

  for (;;) {
    root.yoga.calculateLayout(width, height, direction);
    if (!applyZeroContentGuards(root, guarded)) break;
  }

  return () => {
    for (const [node, display] of [...guarded].reverse()) {
      node.setDisplay(display);
    }
  };
}
