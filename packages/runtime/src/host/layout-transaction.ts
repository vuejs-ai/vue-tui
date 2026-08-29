import Yoga from "yoga-layout";
import type { Node as YogaNode } from "yoga-layout";
import {
  NESTED_STATIC_ERROR,
  createBox,
  createRoot,
  type TuiBox,
  type TuiNode,
  type TuiRoot,
  type TuiStatic,
  type TuiText,
} from "./nodes.ts";
import { attachYoga, detachYoga } from "./yoga.ts";

type YogaCarrier = TuiRoot | TuiBox | TuiText | TuiStatic;
type ContainerWithChildren = TuiRoot | TuiBox | TuiText | TuiStatic;

const activeContentGuards = new WeakSet<YogaNode>();

export type LayoutHeightConstraint =
  | { readonly mode: "exact"; readonly rows: number }
  | { readonly mode: "at-most"; readonly rows: number }
  | { readonly mode: "unbounded" };

export interface LayoutRequest {
  readonly dynamicRoot: TuiRoot;
  readonly staticRoots: readonly TuiStatic[];
  readonly columns: number;
  readonly dynamicHeight: LayoutHeightConstraint;
}

export interface StaticLayoutRegion {
  readonly children: readonly TuiNode[];
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface StaticLayoutResult {
  readonly stat: TuiStatic;
  readonly region: StaticLayoutRegion | null;
}

/** Final geometry for every region produced by one renderer commit. */
export interface LayoutTransactionResult {
  readonly dynamicHeight: number;
  readonly staticLayouts: readonly StaticLayoutResult[];
  dispose(): void;
}

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
  if (!hasYoga(child) || guarded.has(child.yoga)) return false;

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
        // Absolute children use the padding box as their containing block, so a
        // zero content rectangle does not make their layout unavailable.
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

/** Calculates geometry while suppressing flow descendants of zero-content boxes. */
function calculateLayoutWithContentGuards(
  root: TuiRoot,
  width?: number,
  height?: number,
): () => void {
  const guarded = new Map<YogaNode, number>();
  const restore = () => {
    for (const [node, display] of [...guarded].reverse()) {
      node.setDisplay(display);
      activeContentGuards.delete(node);
    }
  };

  try {
    for (;;) {
      root.yoga.calculateLayout(width, height, Yoga.DIRECTION_LTR);
      if (!applyZeroContentGuards(root, guarded)) break;
    }
  } catch (error) {
    restore();
    throw error;
  }

  return restore;
}

function calculateDynamicLayout(
  root: TuiRoot,
  columns: number,
  constraint: LayoutHeightConstraint,
): () => void {
  root.yoga.setWidth(columns);
  if (constraint.mode === "exact") {
    return calculateLayoutWithContentGuards(root, columns, constraint.rows);
  }
  if (constraint.mode === "unbounded") {
    return calculateLayoutWithContentGuards(root, columns);
  }

  let restore = calculateLayoutWithContentGuards(root, columns);
  if (root.yoga.getComputedLayout().height <= constraint.rows) return restore;

  restore();
  restore = calculateLayoutWithContentGuards(root, columns, constraint.rows);
  return restore;
}

function validateStaticPlacement(statics: readonly TuiStatic[]): void {
  for (const stat of statics) {
    let ancestor = stat.parent;
    while (ancestor) {
      if (ancestor.type === "tui-static") throw new Error(NESTED_STATIC_ERROR);
      ancestor = ancestor.parent;
    }
  }
}

function isInertStaticAnchor(child: TuiNode): boolean {
  return child.type === "comment" || (child.type === "text-leaf" && child.value === "");
}

interface StaticLayoutSkeleton {
  readonly root: TuiRoot;
  readonly box: TuiBox;
  readonly dispose: () => void;
}

function attachedYogaNode(node: TuiNode): YogaNode | null {
  if (!("yoga" in node) || typeof node.yoga === "symbol") return null;
  return node.yoga;
}

function findYogaIndex(parent: YogaNode, child: YogaNode): number {
  for (let index = 0; index < parent.getChildCount(); index++) {
    if (parent.getChild(index) === child) return index;
  }
  return 0;
}

function createStaticLayoutSkeleton(
  stat: TuiStatic,
  children: readonly TuiNode[],
  columns: number,
): StaticLayoutSkeleton {
  // Static content needs terminal-width wrapping but may itself be wider than
  // the terminal. A fixed-width root therefore owns an absolute, content-sized
  // box. Only Yoga parentage moves; host parent links keep Vue ownership intact.
  const root = createRoot({} as never);
  const box = createBox();
  const moved: Array<{
    readonly yoga: YogaNode;
    readonly originalParent: YogaNode | null;
    readonly originalIndex: number;
  }> = [];
  const dispose = () => {
    for (const { yoga, originalParent, originalIndex } of moved.reverse()) {
      box.yoga.removeChild(yoga);
      originalParent?.insertChild(yoga, originalIndex);
    }
    box.children.length = 0;
    root.yoga.removeChild(box.yoga);
    detachYoga(box);
    root.children.length = 0;
    detachYoga(root);
  };

  attachYoga(root);
  root.yoga.setWidth(columns);
  attachYoga(box);
  box.yoga.copyStyle(stat.yoga);
  box.yoga.setDisplay(Yoga.DISPLAY_FLEX);
  box.yoga.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE);
  root.yoga.insertChild(box.yoga, 0);
  root.children.push(box);

  let yogaIndex = 0;
  for (const child of children) {
    box.children.push(child);
    const yoga = attachedYogaNode(child);
    if (!yoga) continue;
    const originalParent = yoga.getParent();
    const originalIndex = originalParent ? findYogaIndex(originalParent, yoga) : 0;
    originalParent?.removeChild(yoga);
    box.yoga.insertChild(yoga, yogaIndex);
    moved.push({ yoga, originalParent, originalIndex });
    yogaIndex++;
  }

  return { root, box, dispose };
}

function disposeAll(cleanups: Array<() => void>): void {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Failed to dispose layout transaction.");
}

/**
 * Resolve all dynamic and Static geometry for one renderer commit.
 *
 * An at-most constraint may ask Yoga for natural size before arranging an
 * overflowing tree against the final row bound. That decision stays private to
 * this call; the renderer receives only the final geometry below.
 */
export function runLayoutTransaction(request: LayoutRequest): LayoutTransactionResult {
  validateStaticPlacement(request.staticRoots);
  const cleanups: Array<() => void> = [];

  try {
    const staticLayouts = request.staticRoots
      .filter((stat) => stat.commitState === "open")
      .map((stat): StaticLayoutResult => {
        const children = stat.children.filter((child) => !isInertStaticAnchor(child));
        if (children.length === 0) return { stat, region: null };

        const skeleton = createStaticLayoutSkeleton(stat, children, request.columns);
        cleanups.push(skeleton.dispose);
        const restoreGuards = calculateLayoutWithContentGuards(skeleton.root, request.columns);
        cleanups.push(restoreGuards);
        const layout = skeleton.box.yoga.getComputedLayout();
        return {
          stat,
          region: {
            children,
            width: Math.max(1, Math.floor(layout.width)),
            height: Math.max(1, Math.floor(layout.height)),
            offsetX: -Math.floor(layout.left),
            offsetY: -Math.floor(layout.top),
          },
        };
      });

    cleanups.push(
      calculateDynamicLayout(request.dynamicRoot, request.columns, request.dynamicHeight),
    );
    const dynamicHeight = Math.max(
      0,
      Math.floor(request.dynamicRoot.yoga.getComputedLayout().height),
    );

    return {
      dynamicHeight,
      staticLayouts,
      dispose() {
        disposeAll(cleanups);
      },
    };
  } catch (error) {
    try {
      disposeAll(cleanups);
    } catch {
      // Preserve the layout failure after best-effort restoration.
    }
    throw error;
  }
}
