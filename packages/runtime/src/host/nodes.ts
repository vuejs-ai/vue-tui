import type { AppContext } from "../vue/context.ts";
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
  textAlign?: "left" | "center" | "right";
  wrap?: "wrap" | "hard" | "truncate" | "truncate-middle" | "truncate-start";
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
}

export interface TuiText extends NodeBase {
  type: "tui-text";
  children: TuiInlineNode[];
  yoga: YogaNodeRef;
  style: TuiHostStyle;
  props: TextProps;
  /** Increments whenever cached text composition or measurement can become stale. */
  textRevision: number;
}

export interface TuiVirtualText extends NodeBase {
  type: "tui-virtual-text";
  parent: TuiText | TuiVirtualText | null;
  children: TuiInlineNode[];
  style: TuiHostStyle;
  props: TextProps;
}

export interface TuiTextLeaf extends NodeBase {
  type: "text-leaf";
  parent: TuiText | TuiVirtualText | null;
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
  style: TuiHostStyle;
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

export type TuiInlineNode = TuiVirtualText | TuiTextLeaf | TuiComment;
export type TuiContainer = TuiRoot | TuiBox | TuiStatic | TuiText | TuiVirtualText;
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
  } satisfies TuiBox;
  // Host compatibility shims are implementation details, not declarative
  // props or tree state. Keep them out of node enumeration and snapshots.
  Object.defineProperty(node, "style", { enumerable: false });
  return trackTuiNode(node);
}

export function createText(): TuiText {
  const node = {
    type: "tui-text",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    style: { display: "" },
    props: {},
    textRevision: 0,
  } satisfies TuiText;
  Object.defineProperty(node, "style", { enumerable: false });
  return trackTuiNode(node);
}

export function createVirtualText(): TuiVirtualText {
  const node = {
    type: "tui-virtual-text",
    parent: null,
    children: [],
    style: { display: "" },
    props: {},
  } satisfies TuiVirtualText;
  Object.defineProperty(node, "style", { enumerable: false });
  return trackTuiNode(node);
}

export function createTextLeaf(value: string): TuiTextLeaf {
  // Coerce any private raw-host value at the text sink, which createTextNode also
  // routes through. Vue's runtime-core already stringifies
  // text/number children, so this is a defensive safety-net for direct host-op
  // calls. Guard on typeof so normal string values are untouched (no double-work).
  return trackTuiNode({
    type: "text-leaf",
    parent: null,
    value: typeof value === "string" ? value : String(value),
  });
}

export function createStatic(): TuiStatic {
  const style = {} as TuiHostStyle;
  Object.defineProperty(style, "display", {
    enumerable: true,
    get: () => "",
    set: () => {},
  });
  const node = {
    type: "tui-static",
    parent: null,
    children: [],
    yoga: UNATTACHED_YOGA,
    // Static is an output boundary rather than a layout node. Keep Vue's
    // built-in v-show directive operational while deliberately ignoring its
    // display writes: mounted identity, not visual display, controls eligibility.
    style,
    props: {},
    commitState: "open",
  } satisfies TuiStatic;
  Object.defineProperty(node, "style", { enumerable: false });
  return trackTuiNode(node);
}

export function createComment(value: string): TuiComment {
  return trackTuiNode({ type: "comment", parent: null, value });
}

export function isContainer(node: TuiNode): node is TuiContainer {
  return node.type !== "text-leaf" && node.type !== "comment";
}
