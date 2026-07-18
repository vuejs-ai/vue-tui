import type { AppContext } from "../context.ts";
import type { Node as YogaNode } from "yoga-layout";

export const NESTED_STATIC_ERROR = "<Static> cannot be nested inside another <Static>";

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

/** Minimal DOM-style surface used by Vue's built-in `v-show` directive. */
export interface TuiHostStyle {
  display: string;
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
}

export interface TuiBox extends NodeBase {
  type: "tui-box";
  children: TuiNode[];
  yoga: YogaNodeRef;
  style: TuiHostStyle;
  props: BoxProps;
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
  measuredCache?: string;
  /** Increments whenever cached text composition or measurement can become stale. */
  textRevision: number;
}

export interface TuiVirtualText extends NodeBase {
  type: "tui-virtual-text";
  // A <Newline>/<Text> directly inside a standalone <Transform> renders inline,
  // so a virtual-text can also be parented by a transform (G58).
  parent: TuiText | TuiVirtualText | TuiTransform | null;
  children: TuiInlineNode[];
  props: TextProps;
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
   * Runtime-owned write-once state for this mounted host instance. A normally
   * returned write accepts it; an indeterminate throwing write abandons it.
   * Either terminal state permanently prevents replay.
   */
  commitState: "open" | "accepted" | "abandoned";
  /**
   * Internal component callback invoked after Runtime has marked the host
   * accepted. It releases the accepted slot subtree while retaining the public
   * component instance as the write-once identity.
   */
  onAccepted?: () => void;
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

// Host identity is nominal inside one runtime instance. Structural checks such
// as `typeof value.type === "string"` can mistake an ordinary Vue component's
// public prop for a renderer node, while this registry also recognizes direct
// host refs used by renderer-internal adapters without exposing a public brand.
const tuiNodes = new WeakSet<object>();
const tuiNodeCreationObservers = new Set<(node: TuiNode) => void>();

/**
 * Observe every host-node identity at construction time. This internal test
 * seam is intentionally synchronous: an instrumentation failure must invalidate
 * the run instead of silently producing incomplete lifetime evidence.
 */
export function observeTuiNodeCreations(observer: (node: TuiNode) => void): () => void {
  tuiNodeCreationObservers.add(observer);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    tuiNodeCreationObservers.delete(observer);
  };
}

function trackTuiNode<T extends TuiNode>(node: T): T {
  tuiNodes.add(node);
  for (const observer of tuiNodeCreationObservers) observer(node);
  return node;
}

export function isTuiNode(value: unknown): value is TuiNode {
  return typeof value === "object" && value !== null && tuiNodes.has(value);
}

// Constructors take the bare minimum and leave yoga binding to yoga.ts.
// The `yoga` field is set to a sentinel and replaced by `attachYoga(node)`.
const UNATTACHED_YOGA = Symbol("vue-tui:yoga-unattached") as unknown as YogaNodeRef;

export function createRoot(appContext: AppContext): TuiRoot {
  return trackTuiNode({
    type: "root",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    appContext,
  });
}

export function createBox(): TuiBox {
  const node = {
    type: "tui-box",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    // buildNodeOps replaces this placeholder with a Yoga-backed accessor after
    // attaching the Yoga node. Keeping the field on the bare constructor makes
    // the host shape truthful even in renderer-internal unit tests.
    style: { display: "" },
    props: {},
    paintDirty: true,
  } satisfies TuiBox;
  // Host compatibility shims are implementation details, not declarative
  // props or tree state. Keep them out of node enumeration and snapshots.
  Object.defineProperty(node, "style", { enumerable: false });
  return trackTuiNode(node);
}

export function createText(): TuiText {
  return trackTuiNode({
    type: "tui-text",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    props: {},
    textRevision: 0,
  });
}

export function createVirtualText(): TuiVirtualText {
  return trackTuiNode({
    type: "tui-virtual-text",
    parent: null,
    children: [],
    props: {},
  });
}

export function createTextLeaf(value: string): TuiTextLeaf {
  // Coerce any non-string at the host text sink, matching Ink's setTextNodeValue
  // (dom.ts: `if (typeof text !== 'string') text = String(text)`), which
  // createTextNode also routes through. Vue's runtime-core already stringifies
  // text/number children, so this is a defensive safety-net for direct host-op
  // calls. Guard on typeof so normal string values are untouched (no double-work).
  return trackTuiNode({
    type: "text-leaf",
    parent: null,
    value: typeof value === "string" ? value : String(value),
  });
}

export function createStatic(): TuiStatic {
  return trackTuiNode({
    type: "tui-static",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    props: {},
    commitState: "open",
  });
}

export function createTransform(fn: (line: string, lineIndex: number) => string): TuiTransform {
  return trackTuiNode({
    type: "tui-transform",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    transform: fn,
  });
}

export function createComment(value: string): TuiComment {
  return trackTuiNode({ type: "comment", parent: null, value });
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
