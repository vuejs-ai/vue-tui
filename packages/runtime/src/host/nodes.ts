import type { AppContext } from "../context.ts";
import type { Node as YogaNode } from "yoga-layout";

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
}

export interface TuiBox extends NodeBase {
  type: "tui-box";
  children: TuiNode[];
  yoga: YogaNodeRef;
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
  /** Exclusive item index represented by the currently mounted host children. */
  renderedThrough: number;
  /**
   * Host child nodes settled by the static output channel. Static items are
   * write-once: each preparation skips children in this set. We track by node
   * identity rather than a count because one logical item expands to several
   * host nodes, including Vue fragment anchors. A normally returned write adds
   * its complete prepared batch before the component cursor advances. A
   * throwing write also adds that batch because handoff is indeterminate and an
   * automatic retry could duplicate bytes, but it does not report acceptance to
   * the component.
   */
  writtenNodes: Set<TuiNode>;
  /**
   * Callback registered by the <Static> component, invoked only after the
   * corresponding output write returns normally or an output-free renderer
   * commit succeeds. The prepared render's exclusive item index is passed so a
   * synchronous append during the stream write remains pending for a later
   * commit instead of being skipped by the component cursor.
   */
  onWritten?: (renderedThrough: number) => void;
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

function trackTuiNode<T extends TuiNode>(node: T): T {
  tuiNodes.add(node);
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
  return trackTuiNode({
    type: "tui-box",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    props: {},
    paintDirty: true,
  });
}

export function createText(): TuiText {
  return trackTuiNode({
    type: "tui-text",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    props: {},
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
    renderedThrough: 0,
    writtenNodes: new Set(),
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
