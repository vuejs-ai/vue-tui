import type { AppContext } from "../context.ts";
import type { Node as YogaNode } from "yoga-layout";
import type { MouseHandlerProps } from "../mouse/events.ts";

export type YogaNodeRef = YogaNode;

export interface BoxProps {
  [k: string]: unknown;
}

export interface TextProps {
  color?: unknown;
  backgroundColor?: unknown;
  dimColor?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  wrap?: "wrap" | "hard" | "truncate" | "truncate-end" | "truncate-middle" | "truncate-start";
}

interface NodeBase {
  parent: TuiContainer | null;
}

export interface TuiRoot extends NodeBase {
  type: "root";
  parent: null;
  children: TuiNode[];
  yoga: YogaNodeRef;
  appContext: AppContext;
  /** Currently mounted <Static> node (if any). Updated on insert/remove. */
  staticNode?: TuiStatic;
  /** Listeners invoked after every layout calculation (yoga.calculateLayout). */
  layoutListeners: Set<() => void>;
}

export interface TuiBox extends NodeBase {
  type: "tui-box";
  children: TuiNode[];
  yoga: YogaNodeRef;
  props: BoxProps;
  mouseHandlers?: Partial<MouseHandlerProps>;
  paintDirty: boolean;
  internal_accessibility?: {
    role?: string;
    state?: Record<string, boolean>;
  };
}

export interface TuiText extends NodeBase {
  type: "tui-text";
  children: TuiInlineNode[];
  yoga: YogaNodeRef;
  props: TextProps;
  mouseHandlers?: Partial<MouseHandlerProps>;
  measuredCache?: string;
}

export interface TuiVirtualText extends NodeBase {
  type: "tui-virtual-text";
  // A <Newline>/<Text> directly inside a standalone <Transform> renders inline,
  // so a virtual-text can also be parented by a transform (G58).
  parent: TuiText | TuiVirtualText | TuiTransform | null;
  children: TuiInlineNode[];
  props: TextProps;
  mouseHandlers?: Partial<MouseHandlerProps>;
}

export interface TuiTextLeaf extends NodeBase {
  type: "text-leaf";
  // Bare-string children of a standalone <Transform> render inline, so a
  // text-leaf can also be parented by a transform (G58).
  parent: TuiText | TuiVirtualText | TuiTransform | null;
  value: string;
}

/** Placeholder comment node used by Vue's renderer for v-if / null renders. */
export interface TuiComment extends NodeBase {
  type: "comment";
  value: string;
}

export interface TuiStatic extends NodeBase {
  type: "tui-static";
  children: TuiNode[];
  yoga: YogaNodeRef;
  props: BoxProps;
  /**
   * Host child nodes already written to the static channel. Static items are
   * write-once: each commit only paints the children NOT in this set. We track
   * by node identity rather than a count because a single logical item expands
   * to several host nodes (the <Text>/<Box> plus empty text-leaf fragment
   * anchors Vue inserts), so a positional `writtenCount` would mis-slice. Once a
   * child is painted it is recorded here, then the <Static> component advances
   * its cursor and unmounts it (mirroring Ink's `setIndex(items.length)`).
   */
  writtenNodes: Set<TuiNode>;
  /**
   * Callback registered by the <Static> component, invoked by the renderer AFTER
   * a commit has painted freshly-written items. It advances the component's
   * reactive cursor (Ink's `index`) so the just-written items are sliced out and
   * unmount on the next render — the vue-tui analogue of Ink's post-commit
   * `useLayoutEffect(() => setIndex(items.length))`. Advancing AFTER paint (never
   * during render) guarantees items are written before they are dropped.
   */
  onWritten?: () => void;
}

export interface TuiTransform extends NodeBase {
  type: "tui-transform";
  children: TuiNode[];
  yoga: YogaNodeRef;
  transform: (line: string, lineIndex: number) => string;
}

export type TuiInlineNode = TuiVirtualText | TuiTextLeaf | TuiComment | TuiTransform;
export type TuiContainer = TuiRoot | TuiBox | TuiStatic | TuiTransform | TuiText | TuiVirtualText;
export type TuiNode = TuiContainer | TuiTextLeaf | TuiComment;

// Constructors take the bare minimum and leave yoga binding to yoga.ts.
// The `yoga` field is set to a sentinel and replaced by `attachYoga(node)`.
const UNATTACHED_YOGA = Symbol("vue-tui:yoga-unattached") as unknown as YogaNodeRef;

export function createRoot(appContext: AppContext): TuiRoot {
  return {
    type: "root",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    appContext,
    layoutListeners: new Set(),
  };
}

/**
 * Register a callback to be invoked after every layout calculation.
 * Returns an unsubscribe function.
 */
export function addLayoutListener(root: TuiRoot, listener: () => void): () => void {
  root.layoutListeners.add(listener);
  return () => {
    root.layoutListeners.delete(listener);
  };
}

/** Invoke all registered layout listeners. Called after `yoga.calculateLayout`. */
export function emitLayoutListeners(root: TuiRoot): void {
  for (const listener of root.layoutListeners) {
    listener();
  }
}

export function createBox(): TuiBox {
  return {
    type: "tui-box",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    props: {},
    paintDirty: true,
  };
}

export function createText(): TuiText {
  return {
    type: "tui-text",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    props: {},
  };
}

export function createVirtualText(): TuiVirtualText {
  return {
    type: "tui-virtual-text",
    parent: null,
    children: [],
    props: {},
  };
}

export function createTextLeaf(value: string): TuiTextLeaf {
  // Coerce any non-string at the host text sink, matching Ink's setTextNodeValue
  // (dom.ts: `if (typeof text !== 'string') text = String(text)`), which
  // createTextNode also routes through. Vue's runtime-core already stringifies
  // text/number children, so this is a defensive safety-net for direct host-op
  // calls. Guard on typeof so normal string values are untouched (no double-work).
  return {
    type: "text-leaf",
    parent: null,
    value: typeof value === "string" ? value : String(value),
  };
}

export function createStatic(): TuiStatic {
  return {
    type: "tui-static",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    props: {},
    writtenNodes: new Set(),
  };
}

export function createTransform(fn: (line: string, lineIndex: number) => string): TuiTransform {
  return {
    type: "tui-transform",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    transform: fn,
  };
}

export function createComment(value: string): TuiComment {
  return { type: "comment", parent: null, value };
}

export function isContainer(node: TuiNode): node is TuiContainer {
  return node.type !== "text-leaf" && node.type !== "comment";
}

/**
 * Whether a child counts as a positional line for transform/squash indexing.
 * Mirrors Ink: `null`/`''` children are not rendered as childNodes, so neither a
 * `comment` (Vue's null/false/v-if placeholder) nor an EMPTY `text-leaf` (an
 * empty-string `{''}` child, or a template `<slot/>` boundary anchor) advances the
 * index. Verified against real Ink v7.0.4 (`a{''}<Transform>b` → `ab[1]`, not
 * `ab[2]`). The inverse of static-channel's `isInertStaticAnchor`.
 */
export function advancesLineIndex(child: TuiNode): boolean {
  return child.type !== "comment" && !(child.type === "text-leaf" && child.value === "");
}
