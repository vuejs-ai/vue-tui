export const NESTED_STATIC_ERROR = "<Static> cannot be nested inside another <Static>";

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
  /** Opaque Vue-facing application identity, interpreted at the renderer edge. */
  appContext: object;
}

export interface TuiBox extends NodeBase {
  type: "tui-box";
  children: TuiNode[];
  style: TuiHostStyle;
  props: BoxProps;
}

/** One authored SGR pair with no structured field, and the code that ends it. */
export interface TuiTextRunSgrPair {
  readonly code: string;
  readonly endCode: string;
}

/** One terminal colour, stored independently from its ANSI encoding. */
export type TuiTextRunColor =
  | { readonly kind: "default" }
  | { readonly kind: "ansi16"; readonly index: number }
  | { readonly kind: "ansi256"; readonly index: number }
  | { readonly kind: "rgb"; readonly red: number; readonly green: number; readonly blue: number };

/** The inline visual state one parsed run resolved from the content's SGR. */
export interface TuiTextRunStyle {
  readonly foreground: TuiTextRunColor;
  readonly background: TuiTextRunColor;
  readonly attrs: number;
  readonly extraSgr: readonly TuiTextRunSgrPair[];
}

/** The OSC 8 hyperlink one parsed run carries. */
export interface TuiTextRunLink {
  readonly parameters: string;
  readonly target: string;
}

/**
 * One grapheme of a Text node's parsed content, already in the shape paint
 * writes into a frame: this is field for field a `frame/` cell. `text/`
 * produces these and `layout/` stores them here, but `host/` imports nothing,
 * so the shape is declared rather than imported — assigning a cell into a node
 * and a run back out keeps the two declarations in agreement.
 */
export interface TuiTextRun {
  readonly grapheme: string;
  /** The columns this grapheme displays, which is zero for a combining mark. */
  readonly width: number;
  readonly style: TuiTextRunStyle;
  readonly link: TuiTextRunLink | undefined;
}

/**
 * A full SGR reset written inside the content also cancels the SGR the
 * enclosing Text hosts open around it, because a reset closes those spans
 * without the re-open each span's own end code triggers. `at[i]` is the run a
 * reset last took effect at within the current physical line (`-1` for none),
 * and `rearmed[i]` the end codes seen since, so a later `\x1b[39m` restores the
 * foreground span alone.
 */
export interface TuiTextContentReset {
  readonly at: readonly number[];
  readonly rearmed: readonly number[];
}

/** The runs one nested inline host contributes, in content order. */
export interface TuiTextChunk {
  readonly runs: number;
  /** The nested inline hosts enclosing this chunk, outermost first. */
  readonly nesting: readonly TuiVirtualText[];
}

/** A Text node's content, parsed once per content revision. */
export interface TuiTextContent {
  /** The `contentRevision` this was parsed from. */
  readonly revision: number;
  /** The sanitized source text, which `layout/` measures and wraps. */
  readonly text: string;
  readonly runs: readonly TuiTextRun[];
  readonly chunks: readonly TuiTextChunk[];
  readonly reset: TuiTextContentReset | null;
}

export interface TuiText extends NodeBase {
  type: "tui-text";
  children: TuiInlineNode[];
  style: TuiHostStyle;
  props: TextProps;
  /** Increments whenever this node's content, and only its content, changes. */
  contentRevision: number;
  /** The parse of that content, refreshed by `layout/` when the revision moves. */
  content: TuiTextContent | null;
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

/** One run of source text beneath a text host, and the hosts that style it. */
export interface TuiTextChunkSource {
  /** The raw text this chunk contributes, in content order. */
  text: string;
  /** The nested inline hosts enclosing it, outermost first. */
  readonly nesting: readonly TuiVirtualText[];
}

/**
 * Collect the source text beneath one text host without interpreting it, split
 * where the nested inline hosts that style it change. Adjacent leaves under one
 * host stay in a single chunk, so an escape sequence written across two of them
 * survives; `text/` interprets each chunk.
 */
export function collectTextChunks(node: TuiText | TuiVirtualText): TuiTextChunkSource[] {
  const chunks: TuiTextChunkSource[] = [];
  collectTextChunksInto(node, [], chunks);
  return chunks;
}

function collectTextChunksInto(
  node: TuiText | TuiVirtualText,
  nesting: readonly TuiVirtualText[],
  chunks: TuiTextChunkSource[],
): void {
  if (node.style.display === "none") return;
  let open: TuiTextChunkSource | undefined;
  for (const child of node.children) {
    if (child.type === "text-leaf") {
      if (child.value === "") continue;
      if (open) open.text += child.value;
      else {
        open = { text: child.value, nesting };
        chunks.push(open);
      }
    } else if (child.type === "tui-virtual-text") {
      const before = chunks.length;
      collectTextChunksInto(child, [...nesting, child], chunks);
      // A nested host that contributed nothing leaves the surrounding text in
      // one chunk, exactly as one uninterrupted run of leaves would be.
      if (chunks.length !== before) open = undefined;
    }
  }
}

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

// Constructors take the bare minimum. `layout/` keeps their engine state in a
// private node-to-engine map, so host identity remains engine-independent.

export function createRoot(appContext: object): TuiRoot {
  return trackTuiNode({
    type: "root",
    parent: null,
    children: [],
    appContext,
  });
}

export function createBox(): TuiBox {
  const node = {
    type: "tui-box",
    parent: null,
    children: [],
    // buildNodeOps replaces this placeholder with Vue's display bridge after
    // attaching the private layout-engine node.
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
    style: { display: "" },
    props: {},
    contentRevision: 0,
    content: null,
  } satisfies TuiText;
  Object.defineProperty(node, "style", { enumerable: false });
  // The parse is derived from the children, not declarative tree state.
  Object.defineProperty(node, "content", { enumerable: false });
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
