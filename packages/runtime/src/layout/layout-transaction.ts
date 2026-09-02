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
} from "../host/nodes.ts";
import {
  attachYoga,
  detachYoga,
  getAttachedYogaNode,
  getComputedTextMeasure,
  getYogaNode,
} from "./yoga.ts";

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

export interface ComputedRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ComputedInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface ComputedTextLayout {
  /** Complete raw line structure from the measurement routine. */
  readonly wrappedLines: readonly string[];
  /** Whole-cell width shared by measurement and styled paint. */
  readonly wrapWidth: number;
}

/** One node's immutable product of the completed Yoga pass. */
export interface ComputedNodeLayout {
  readonly rect: ComputedRect;
  readonly border: ComputedInsets;
  readonly padding: ComputedInsets;
  readonly isLaidOut: boolean;
  readonly isContentLayoutGuarded: boolean;
  readonly isAbsolute: boolean;
  readonly text?: ComputedTextLayout;
}

/**
 * Geometry snapshot from one layout transaction. Consumers can learn layout
 * facts only through this map; the Yoga handles stay inside `layout/`.
 */
export interface ComputedLayout {
  get(node: TuiNode): ComputedNodeLayout | undefined;
}

/** Final geometry for every region produced by one renderer commit. */
export interface LayoutTransactionResult {
  readonly dynamicHeight: number;
  readonly staticLayouts: readonly StaticLayoutResult[];
  readonly computed: ComputedLayout;
  dispose(): void;
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
  const yoga = getYogaNode(node);
  const layout = yoga.getComputedLayout();
  const width = Math.max(0, Math.floor(layout.width));
  const height = Math.max(0, Math.floor(layout.height));
  const border = readInsets(yoga, "border");
  const padding = readInsets(yoga, "padding");
  const left = border.left + padding.left;
  const right = border.right + padding.right;
  const top = border.top + padding.top;
  const bottom = border.bottom + padding.bottom;

  return {
    width: Math.max(0, Math.floor(width - left - right)),
    height: Math.max(0, Math.floor(height - top - bottom)),
  };
}

function readInsets(node: YogaNode, kind: "border" | "padding"): ComputedInsets {
  const read =
    kind === "border" ? node.getComputedBorder.bind(node) : node.getComputedPadding.bind(node);
  return {
    top: read(Yoga.EDGE_TOP),
    right: read(Yoga.EDGE_RIGHT),
    bottom: read(Yoga.EDGE_BOTTOM),
    left: read(Yoga.EDGE_LEFT),
  };
}

/**
 * Whether the application hid `node` or an ancestor, read live from the tree.
 * Nodes a zero-content guard collapsed are excluded: that hiding lasts one
 * pass, so counting it would clear focus mid-transaction and never restore it.
 */
export function isHiddenByApplication(node: TuiNode): boolean {
  for (let current: TuiNode | null = node; current; current = current.parent) {
    const style = (current as { readonly style?: { readonly display?: string } }).style;
    if (style?.display === "none") return true;
    const yoga = getAttachedYogaNode(current);
    if (yoga && !activeContentGuards.has(yoga) && yoga.getDisplay() === Yoga.DISPLAY_NONE) {
      return true;
    }
  }
  return false;
}

function captureComputedLayout(roots: readonly TuiNode[]): ComputedLayout {
  const layouts = new WeakMap<TuiNode, ComputedNodeLayout>();

  const visit = (node: TuiNode, parentIsLaidOut: boolean, parentGuarded: boolean): void => {
    const yoga = getAttachedYogaNode(node);
    const style = (node as { readonly style?: { readonly display?: string } }).style;
    // A guard collapses a zero-content box by hiding its children for this pass
    // only, and the whole subtree beneath one is equally transient. `hideYogaChild`
    // never guards a node that is already hidden, so a Yoga display of `none` with
    // no guard on it is the application's own `display: none` -- which is where
    // `v-show` lands for a Box, because it patches the prop rather than the style
    // accessor.
    const guardedHere = yoga !== null && activeContentGuards.has(yoga);
    // Guardedness follows the subtree, because a guard collapses everything under
    // it for one pass. It stops at a node the application hid in its own right:
    // that node's state is `display: none` and must keep reporting as such even
    // while an ancestor happens to be collapsed.
    const hiddenInOwnRight =
      style?.display === "none" ||
      (!guardedHere && yoga !== null && yoga.getDisplay() === Yoga.DISPLAY_NONE);
    const guarded = guardedHere || (parentGuarded && !hiddenInOwnRight);
    const isLaidOut =
      parentIsLaidOut &&
      style?.display !== "none" &&
      (yoga === null || yoga.getDisplay() !== Yoga.DISPLAY_NONE);
    if (yoga) {
      const raw = yoga.getComputedLayout();
      const text =
        node.type === "tui-text" && isLaidOut
          ? (() => {
              const measured = getComputedTextMeasure(node);
              return {
                wrapWidth: measured.wrapWidth,
                wrappedLines: measured.wrappedLines,
              } satisfies ComputedTextLayout;
            })()
          : undefined;
      layouts.set(node, {
        rect: { left: raw.left, top: raw.top, width: raw.width, height: raw.height },
        border: readInsets(yoga, "border"),
        padding: readInsets(yoga, "padding"),
        isLaidOut,
        isContentLayoutGuarded: guarded,
        isAbsolute: yoga.getPositionType() === Yoga.POSITION_TYPE_ABSOLUTE,
        text,
      });
    }

    if (!hasChildren(node)) return;
    // Static children are measured and painted in their own layout region, not
    // through the static anchor's deliberately hidden dynamic Yoga node.
    const childParentIsLaidOut = node.type === "tui-static" ? true : isLaidOut;
    const childParentGuarded = node.type === "tui-static" ? false : guarded;
    for (const child of node.children) visit(child, childParentIsLaidOut, childParentGuarded);
  };

  for (const root of roots) visit(root, true, false);
  return {
    get: (node) => layouts.get(node),
  };
}

function hideYogaChild(child: TuiNode, guarded: Map<YogaNode, number>): boolean {
  const yoga = getAttachedYogaNode(child);
  if (!yoga || guarded.has(yoga)) return false;

  const display = yoga.getDisplay();
  if (display === Yoga.DISPLAY_NONE) return false;

  guarded.set(yoga, display);
  activeContentGuards.add(yoga);
  yoga.setDisplay(Yoga.DISPLAY_NONE);
  return true;
}

function applyZeroContentGuards(node: TuiNode, guarded: Map<YogaNode, number>): boolean {
  if (getAttachedYogaNode(node)?.getDisplay() === Yoga.DISPLAY_NONE) return false;

  let changed = false;
  if (node.type === "tui-box") {
    const inner = getBoxInnerSize(node);
    if (inner.width === 0 || inner.height === 0) {
      for (const child of node.children) {
        // Absolute children use the padding box as their containing block, so a
        // zero content rectangle does not make their layout unavailable.
        if (getAttachedYogaNode(child)?.getPositionType() === Yoga.POSITION_TYPE_ABSOLUTE) {
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
      getYogaNode(root).calculateLayout(width, height, Yoga.DIRECTION_LTR);
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
  const yoga = getYogaNode(root);
  yoga.setWidth(columns);
  if (constraint.mode === "exact") {
    return calculateLayoutWithContentGuards(root, columns, constraint.rows);
  }
  if (constraint.mode === "unbounded") {
    return calculateLayoutWithContentGuards(root, columns);
  }

  let restore = calculateLayoutWithContentGuards(root, columns);
  if (yoga.getComputedLayout().height <= constraint.rows) return restore;

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

  attachYoga(root);
  const rootYoga = getYogaNode(root);
  rootYoga.setWidth(columns);
  attachYoga(box);
  const boxYoga = getYogaNode(box);
  boxYoga.copyStyle(getYogaNode(stat));
  boxYoga.setDisplay(Yoga.DISPLAY_FLEX);
  boxYoga.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE);
  rootYoga.insertChild(boxYoga, 0);
  root.children.push(box);

  const dispose = () => {
    for (const { yoga, originalParent, originalIndex } of moved.reverse()) {
      boxYoga.removeChild(yoga);
      originalParent?.insertChild(yoga, originalIndex);
    }
    box.children.length = 0;
    rootYoga.removeChild(boxYoga);
    detachYoga(box);
    root.children.length = 0;
    detachYoga(root);
  };

  let yogaIndex = 0;
  for (const child of children) {
    box.children.push(child);
    const yoga = getAttachedYogaNode(child);
    if (!yoga) continue;
    const originalParent = yoga.getParent();
    const originalIndex = originalParent ? findYogaIndex(originalParent, yoga) : 0;
    originalParent?.removeChild(yoga);
    boxYoga.insertChild(yoga, yogaIndex);
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
        const layout = getYogaNode(skeleton.box).getComputedLayout();
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
      Math.floor(getYogaNode(request.dynamicRoot).getComputedLayout().height),
    );
    const computed = captureComputedLayout([request.dynamicRoot, ...request.staticRoots]);

    return {
      dynamicHeight,
      staticLayouts,
      computed,
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
