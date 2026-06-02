import Yoga from "yoga-layout";
import type { Node as YogaNode, Align, FlexDirection, Justify, Wrap } from "yoga-layout";
import type {
  TuiBox,
  TuiContainer,
  TuiNode,
  TuiRoot,
  TuiStatic,
  TuiText,
  TuiTransform,
} from "./nodes.ts";
import {
  flattenLeaves,
  flattenTransformLeaves,
  measureTextNatural,
  wrapText,
} from "./text-measure.ts";

type YogaCarrier = TuiRoot | TuiBox | TuiText | TuiStatic | TuiTransform;

// --- yoga node lifecycle seam --------------------------------------------

let _createCount = 0;
let _freeCount = 0;

export function createYogaNode(): YogaNode {
  _createCount++;
  return Yoga.Node.create();
}

export function freeYogaNode(node: YogaNode): void {
  _freeCount++;
  node.free();
}

export const yogaNodeTracker = {
  reset(): void {
    _createCount = 0;
    _freeCount = 0;
  },
  snapshot(): { created: number; freed: number; live: number } {
    return {
      created: _createCount,
      freed: _freeCount,
      live: _createCount - _freeCount,
    };
  },
};

// -------------------------------------------------------------------------

function hasYoga(node: TuiNode): node is YogaCarrier {
  return (
    node.type === "root" ||
    node.type === "box" ||
    node.type === "text" ||
    node.type === "static" ||
    node.type === "transform"
  );
}

export function attachYoga(node: YogaCarrier): void {
  node.yoga = createYogaNode();
  // Static nodes are painted via a separate channel (paintIsolated), so they
  // must not occupy space in the dynamic frame's yoga layout.
  if (node.type === "static") {
    (node.yoga as YogaNode).setDisplay(Yoga.DISPLAY_NONE);
  }
  // Box nodes match Ink's defaults: row direction, shrinkable, no wrap.
  // These are set at the yoga level so they work regardless of whether props
  // are passed through Vue's reactive system (which may include undefined
  // overrides or border defaults). User-provided props override these via
  // patchProp which runs after attachYoga.
  if (node.type === "box") {
    (node.yoga as YogaNode).setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
    (node.yoga as YogaNode).setFlexShrink(1);
    (node.yoga as YogaNode).setFlexWrap(Yoga.WRAP_NO_WRAP);
    (node.yoga as YogaNode).setFlexGrow(0);
  }
  // Text nodes match Ink's <ink-text> defaults: row direction, shrinkable.
  // Although text nodes rarely have yoga-carrying children, this ensures
  // consistent layout behavior matching Ink.
  if (node.type === "text") {
    (node.yoga as YogaNode).setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
    (node.yoga as YogaNode).setFlexShrink(1);
    (node.yoga as YogaNode).setFlexGrow(0);
  }
  // Transform nodes match Ink's Transform which renders as ink-text:
  // flexShrink=1, flexDirection='row'. This makes transform a yoga carrier
  // so it participates in layout (multi-line text gets proper height).
  if (node.type === "transform") {
    (node.yoga as YogaNode).setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
    (node.yoga as YogaNode).setFlexShrink(1);
    (node.yoga as YogaNode).setFlexGrow(0);
    // A standalone <Transform> with DIRECT inline children (bare strings,
    // <Newline>) is, in Ink, an ink-text host that measures its own squashed
    // text. Bind a text-style measure func so such a transform gets a real size
    // (its text-leaf children carry no yoga node of their own). The measure func
    // is cleared the moment a yoga-carrying child (e.g. <Text>) is inserted —
    // yoga forbids a node with both a measure func and children — and re-bound
    // when the last such child is removed. (G58)
    bindTransformMeasure(node);
  }
}

/** A transform yoga node has at least one yoga-carrying child (e.g. a <Text>). */
export function transformHasYogaChild(node: TuiTransform): boolean {
  return (node.yoga as YogaNode).getChildCount() > 0;
}

export function detachYoga(node: YogaCarrier): void {
  freeYogaNode(node.yoga as YogaNode);
}

// Returns the yoga index a child should occupy when added to `parent`.
// Skips any siblings that don't carry a yoga node or that were excluded
// from the yoga tree (e.g., transform nodes inside text parents).
function yogaIndexFor(parent: TuiContainer, child: TuiNode): number {
  // A transform parent is also a text context (Ink models <Transform> as
  // ink-text), so a transform child of it is inline and excluded from yoga —
  // same as for a text/virtual-text parent. (G58 MF2)
  const isTextParent =
    parent.type === "text" || parent.type === "virtual-text" || parent.type === "transform";
  let yIdx = 0;
  for (const sibling of parent.children) {
    if (sibling === child) return yIdx;
    if (hasYoga(sibling)) {
      // Transform nodes inside text/transform parents are not in the yoga tree.
      if (isTextParent && sibling.type === "transform") continue;
      yIdx++;
    }
  }
  return yIdx;
}

export function insertYogaChild(parent: TuiContainer, child: TuiNode, _domIndex: number): void {
  if (!hasYoga(parent) || !hasYoga(child)) return;
  // Transform nodes inside a Text OR another Transform parent are inline: they
  // participate in renderTextWithInlineStyles / squashTransformChild, not in yoga
  // layout. Skip inserting them into the yoga tree to avoid corrupting text
  // measurement — the enclosing standalone transform measures the whole squashed
  // text (incl. this inline transform's effect via flattenTransformLeaves), so
  // making it a yoga child would (a) double-count it and (b) clear the parent's
  // measure func, leaving the inner width unreserved. (G58 MF2; G32 keeps working
  // because a transform-in-transform inside a <Text> was already excluded as a
  // child of an inline transform here.)
  // (VirtualText parents are already excluded by the hasYoga check above.)
  if (child.type === "transform" && (parent.type === "text" || parent.type === "transform")) {
    return;
  }
  // A transform with a yoga-carrying child (e.g. <Transform><Text>…) lays out
  // from that child, not from a measure func. Yoga forbids a node having both a
  // measure func and children, so clear the standalone-transform measure func
  // before inserting the child. (G58)
  if (parent.type === "transform") {
    (parent.yoga as YogaNode).unsetMeasureFunc();
  }
  const yIdx = yogaIndexFor(parent, child);
  (parent.yoga as YogaNode).insertChild(child.yoga as YogaNode, yIdx);
}

export function removeYogaChild(parent: TuiContainer, child: TuiNode): void {
  if (!hasYoga(parent) || !hasYoga(child)) return;
  // Transform nodes inside a text/transform parent were never inserted into yoga
  // (mirror of insertYogaChild's inline-transform skip). (G58 MF2)
  if (child.type === "transform" && (parent.type === "text" || parent.type === "transform")) {
    return;
  }
  (parent.yoga as YogaNode).removeChild(child.yoga as YogaNode);
  // If removing the last yoga child from a transform, restore the inline-text
  // measure func so the transform can still size its direct text-leaf children
  // (it has become a standalone inline-text transform again). (G58)
  if (parent.type === "transform" && (parent.yoga as YogaNode).getChildCount() === 0) {
    bindTransformMeasure(parent as TuiTransform);
  }
}

// --- prop application ----------------------------------------------------

const YOGA_PROP_SETTERS: Record<string, (n: YogaNode, v: unknown) => void> = {
  // Mirror Ink's applyDimensionStyles width/height branch exactly (styles.ts:664-682):
  //   number → setWidth (absolute cells)
  //   string → setWidthPercent(Number.parseInt(v, 10)) — ANY string is a PERCENT,
  //     so a bare-numeric string like "50" is 50%, NOT 50 absolute cells, and
  //     parseInt TRUNCATES fractions ("55.9%" → 55%). parseInt("") → NaN, which
  //     yoga's percent setter accepts without throwing.
  //   else   → setWidthAuto() — this is the load-bearing fallback (like flexBasis's
  //     setFlexBasisAuto): Vue's [Number, String] prop validation only WARNS on a
  //     bad runtime value (e.g. width={false}/{}/[]) and still forwards it, so
  //     without this branch the raw setWidth(false) THROWS ("Invalid value false
  //     for setWidth") and crashes the render where Ink renders fine via auto.
  // null/undefined also land in the else branch → auto (the G19 removal reset,
  // equivalent to the prior setWidth("auto")).
  width: (n, v) => {
    if (typeof v === "number") {
      n.setWidth(v);
    } else if (typeof v === "string") {
      n.setWidthPercent(Number.parseInt(v, 10));
    } else {
      n.setWidthAuto();
    }
  },
  height: (n, v) => {
    if (typeof v === "number") {
      n.setHeight(v);
    } else if (typeof v === "string") {
      n.setHeightPercent(Number.parseInt(v, 10));
    } else {
      n.setHeightAuto();
    }
  },
  // Mirror Ink's applyDimensionStyles minWidth branch exactly (styles.ts:684-690):
  //   string → setMinWidthPercent(Number.parseInt(v, 10))
  //   else   → setMinWidth(v ?? 0) — number falls here (= setMinWidth(v)), and so
  //     does a junk value (e.g. minWidth={false} → setMinWidth(false), which THROWS
  //     in yoga exactly as it does in Ink, since `?? 0` only catches null/undefined).
  //     Ink has no auto fallback for min/max, so we faithfully forward junk to the
  //     cell setter and match Ink's behavior, including its throw.
  // Ink default: minWidth=0 (yoga default) → null/undefined reset to 0 on removal. (G19)
  minWidth: (n, v) =>
    typeof v === "string"
      ? n.setMinWidthPercent(Number.parseInt(v, 10))
      : n.setMinWidth(v == null ? 0 : (v as number)),
  // Mirror Ink's minHeight branch (styles.ts:692-698); see minWidth above.
  // Ink default: minHeight=0 (yoga default) → null/undefined reset to 0 on removal. (G19)
  minHeight: (n, v) =>
    typeof v === "string"
      ? n.setMinHeightPercent(Number.parseInt(v, 10))
      : n.setMinHeight(v == null ? 0 : (v as number)),
  // Ink default: flexGrow=0 (Box.tsx hardcodes flexGrow:0). Reset to 0 on removal. (G19)
  flexGrow: (n, v) => n.setFlexGrow(v == null ? 0 : (v as number)),
  // Ink default: flexShrink=1 (Box.tsx hardcodes flexShrink:1). Reset to 1 on removal. (G19)
  flexShrink: (n, v) => n.setFlexShrink(v == null ? 1 : (v as number)),
  // Ink default: flexBasis=auto (yoga default), reset via the else branch on removal. (G19)
  // Mirror Ink's flexBasis branch exactly (styles.ts:547-555):
  //   number → setFlexBasis (absolute cells)
  //   string → setFlexBasisPercent(Number.parseInt(v, 10))  — ANY string is a
  //     PERCENT, including a bare numeric string like "3" → 3% (NOT 3 cells)
  //     and "50%" → 50%; yoga would otherwise read "3" as 3 absolute cells.
  //   else   → setFlexBasisAuto()  — this is the load-bearing fallback: Vue's
  //     [Number, String] prop validation only WARNS on a bad runtime value
  //     (e.g. flexBasis={false}/{}/[]) and still forwards it, so without this
  //     branch setFlexBasis(false) THROWS where Ink renders fine via auto.
  // null/undefined also lands in the else branch → auto (the G19 removal reset).
  flexBasis: (n, v) => {
    if (typeof v === "number") {
      n.setFlexBasis(v);
    } else if (typeof v === "string") {
      n.setFlexBasisPercent(Number.parseInt(v, 10));
    } else {
      n.setFlexBasisAuto();
    }
  },
  // Ink default: flexDirection=row (Box.tsx hardcodes flexDirection:'row'). Reset to ROW on removal. (G19)
  flexDirection: (n, v) =>
    n.setFlexDirection(v == null ? Yoga.FLEX_DIRECTION_ROW : toFlexDirection(v as string)),
  // Ink default: flexWrap=nowrap (Box.tsx hardcodes flexWrap:'nowrap'). Reset to NO_WRAP on removal. (G19)
  flexWrap: (n, v) => n.setFlexWrap(v == null ? Yoga.WRAP_NO_WRAP : toFlexWrap(v as string)),
  // Ink default: alignItems=stretch (yoga default). Reset to STRETCH on removal. (G19)
  alignItems: (n, v) => n.setAlignItems(v == null ? Yoga.ALIGN_STRETCH : toAlign(v as string)),
  // Ink default: alignSelf=auto (yoga default). Reset to AUTO on removal. (G19)
  alignSelf: (n, v) => n.setAlignSelf(v == null ? Yoga.ALIGN_AUTO : toAlign(v as string)),
  // Ink default: justifyContent=flex-start (yoga default). Reset to FLEX_START on removal. (G19)
  justifyContent: (n, v) =>
    n.setJustifyContent(v == null ? Yoga.JUSTIFY_FLEX_START : toJustify(v as string)),
  // Ink default: gap=0 (yoga default). Reset to 0 on removal. (G19)
  gap: (n, v) => n.setGap(Yoga.GUTTER_ALL, v == null ? 0 : (v as number)),
  // Ink default: columnGap=0 (yoga default). Reset to 0 on removal. (G19)
  columnGap: (n, v) => n.setGap(Yoga.GUTTER_COLUMN, v == null ? 0 : (v as number)),
  // Ink default: rowGap=0 (yoga default). Reset to 0 on removal. (G19)
  rowGap: (n, v) => n.setGap(Yoga.GUTTER_ROW, v == null ? 0 : (v as number)),

  // Ink default: margin=0 (yoga default). Reset all margin edges to 0 on removal. (G19)
  margin: (n, v) => n.setMargin(Yoga.EDGE_ALL, v == null ? 0 : (v as number)),
  // marginX/marginY map to the HORIZONTAL/VERTICAL axis edges (matching Ink
  // styles.ts applyMarginStyles). These compose with the specific edges per
  // yoga precedence (EDGE_START/END/TOP/BOTTOM override the axis), so removing
  // the axis resets only the axis edge and never clobbers a surviving
  // marginLeft/Right/Top/Bottom. (Blocker 1)
  marginX: (n, v) => n.setMargin(Yoga.EDGE_HORIZONTAL, v == null ? 0 : (v as number)),
  marginY: (n, v) => n.setMargin(Yoga.EDGE_VERTICAL, v == null ? 0 : (v as number)),
  marginTop: (n, v) => n.setMargin(Yoga.EDGE_TOP, v == null ? 0 : (v as number)),
  marginBottom: (n, v) => n.setMargin(Yoga.EDGE_BOTTOM, v == null ? 0 : (v as number)),
  marginLeft: (n, v) => n.setMargin(Yoga.EDGE_START, v == null ? 0 : (v as number)),
  marginRight: (n, v) => n.setMargin(Yoga.EDGE_END, v == null ? 0 : (v as number)),

  // Ink default: padding=0 (yoga default). Reset all padding edges to 0 on removal. (G19)
  padding: (n, v) => n.setPadding(Yoga.EDGE_ALL, v == null ? 0 : (v as number)),
  // paddingX/paddingY map to the HORIZONTAL/VERTICAL axis edges (matching Ink
  // styles.ts applyPaddingStyles); same composition/reset semantics as margin.
  paddingX: (n, v) => n.setPadding(Yoga.EDGE_HORIZONTAL, v == null ? 0 : (v as number)),
  paddingY: (n, v) => n.setPadding(Yoga.EDGE_VERTICAL, v == null ? 0 : (v as number)),
  paddingTop: (n, v) => n.setPadding(Yoga.EDGE_TOP, v == null ? 0 : (v as number)),
  paddingBottom: (n, v) => n.setPadding(Yoga.EDGE_BOTTOM, v == null ? 0 : (v as number)),
  paddingLeft: (n, v) => n.setPadding(Yoga.EDGE_LEFT, v == null ? 0 : (v as number)),
  paddingRight: (n, v) => n.setPadding(Yoga.EDGE_RIGHT, v == null ? 0 : (v as number)),

  borderStyle: (n, v) => {
    // Border occupies 1 cell on every side when a style is set.
    const w = v ? 1 : 0;
    n.setBorder(Yoga.EDGE_TOP, w);
    n.setBorder(Yoga.EDGE_BOTTOM, w);
    n.setBorder(Yoga.EDGE_LEFT, w);
    n.setBorder(Yoga.EDGE_RIGHT, w);
  },
  borderTop: (n, v) => n.setBorder(Yoga.EDGE_TOP, v ? 1 : 0),
  borderBottom: (n, v) => n.setBorder(Yoga.EDGE_BOTTOM, v ? 1 : 0),
  borderLeft: (n, v) => n.setBorder(Yoga.EDGE_LEFT, v ? 1 : 0),
  borderRight: (n, v) => n.setBorder(Yoga.EDGE_RIGHT, v ? 1 : 0),

  // Ink styles.ts applyDisplayStyles: `display === 'flex' ? DISPLAY_FLEX : DISPLAY_NONE`,
  // so ANY present value that isn't 'flex' (incl. off-spec strings reachable via a TS
  // bypass — the public prop type is 'flex' | 'none') hides (A21). A19 carve-out: a
  // removed/undefined `display` (value is null/undefined) must reset to the visible
  // default DISPLAY_FLEX — Vue can't tell `display={undefined}` from an omitted prop, so
  // it falls under the declarative render = f(current props) reset, NOT Ink's hide-on-
  // present-undefined. Hence the `v != null` guard: ANY present (non-null) value except
  // 'flex' hides — matching Ink, which hides non-string present junk too (`display={5}`,
  // a deep TS-bypass: `5 === 'flex'` is false → DISPLAY_NONE) — while null/undefined
  // (removed) → DISPLAY_FLEX (A19).
  display: (n, v) =>
    n.setDisplay(v != null && v !== "flex" ? Yoga.DISPLAY_NONE : Yoga.DISPLAY_FLEX),
  // Ink does NOT call setOverflow on yoga — it only clips visually in paint.
  // Calling setOverflow(HIDDEN) would prevent nodes from expanding beyond
  // their bounds during layout, which differs from Ink's behavior.
  overflow: (_n, _v) => {},
  // Yoga does not support per-axis overflow; these are accepted silently.
  overflowX: (_n, _v) => {},
  overflowY: (_n, _v) => {},
  // Mirror Ink's applyDimensionStyles maxWidth branch (styles.ts:700-714):
  //   string → setMaxWidthPercent(Number.parseInt(v, 10))
  //   else   → setMaxWidth(v) — number falls here; a junk value (maxWidth={false})
  //     forwards to setMaxWidth(false), which THROWS in yoga exactly as in Ink (Ink
  //     has no auto fallback for max). We map null/undefined → NaN here (yoga's "no
  //     max", the G19 removal reset) because Vue's host renderer can deliver raw
  //     null and setMaxWidth(null) throws ("Cannot read properties of null"); NaN is
  //     equivalent to Ink's else with an absent/undefined value.
  maxWidth: (n, v) =>
    typeof v === "string"
      ? n.setMaxWidthPercent(Number.parseInt(v, 10))
      : n.setMaxWidth(v == null ? (NaN as never) : (v as number)),
  // Mirror Ink's maxHeight branch (styles.ts:708-714); see maxWidth above.
  maxHeight: (n, v) =>
    typeof v === "string"
      ? n.setMaxHeightPercent(Number.parseInt(v, 10))
      : n.setMaxHeight(v == null ? (NaN as never) : (v as number)),
  aspectRatio: (n, v) =>
    v == null ? n.setAspectRatio(undefined as never) : n.setAspectRatio(v as number),
  alignContent: (n, v) =>
    v == null ? n.setAlignContent(Yoga.ALIGN_FLEX_START) : n.setAlignContent(toAlign(v as string)),
  // Ink default: position=relative (yoga default). Reset to RELATIVE on removal. (G19)
  position: (n, v) => n.setPositionType(toPosition(v as string | undefined)),
  // Mirror Ink's applyPositionStyles branch exactly (styles.ts:428-441):
  //   string → setPositionPercent(edge, Number.parseFloat(value)) — so a
  //     bare-numeric string like top="50" is 50% of the container, NOT 50 absolute
  //     cells. NOTE: Ink uses parseFloat for positions (preserving fractions) vs
  //     parseInt for dimensions (above) — that distinction is intentional, keep it.
  //   else   → setPosition(edge, value) — number falls here; a junk value
  //     (top={false}) forwards to setPosition(edge, false), which THROWS in yoga
  //     exactly as in Ink (Ink has no auto fallback for positions). We map
  //     null/undefined → NaN here (yoga's auto, the G19 removal reset), the
  //     equivalent of Ink's else with an absent value (Vue can deliver raw null,
  //     and setPosition(edge, null) throws).
  top: (n, v) =>
    typeof v === "string"
      ? n.setPositionPercent(Yoga.EDGE_TOP, Number.parseFloat(v))
      : n.setPosition(Yoga.EDGE_TOP, v == null ? (NaN as never) : (v as number)),
  right: (n, v) =>
    typeof v === "string"
      ? n.setPositionPercent(Yoga.EDGE_RIGHT, Number.parseFloat(v))
      : n.setPosition(Yoga.EDGE_RIGHT, v == null ? (NaN as never) : (v as number)),
  bottom: (n, v) =>
    typeof v === "string"
      ? n.setPositionPercent(Yoga.EDGE_BOTTOM, Number.parseFloat(v))
      : n.setPosition(Yoga.EDGE_BOTTOM, v == null ? (NaN as never) : (v as number)),
  left: (n, v) =>
    typeof v === "string"
      ? n.setPositionPercent(Yoga.EDGE_LEFT, Number.parseFloat(v))
      : n.setPosition(Yoga.EDGE_LEFT, v == null ? (NaN as never) : (v as number)),
};

function toFlexDirection(v: string): FlexDirection {
  return {
    row: Yoga.FLEX_DIRECTION_ROW,
    "row-reverse": Yoga.FLEX_DIRECTION_ROW_REVERSE,
    column: Yoga.FLEX_DIRECTION_COLUMN,
    "column-reverse": Yoga.FLEX_DIRECTION_COLUMN_REVERSE,
  }[v]!;
}

function toFlexWrap(v: string): Wrap {
  return {
    nowrap: Yoga.WRAP_NO_WRAP,
    wrap: Yoga.WRAP_WRAP,
    "wrap-reverse": Yoga.WRAP_WRAP_REVERSE,
  }[v]!;
}

function toAlign(v: string): Align {
  return {
    auto: Yoga.ALIGN_AUTO,
    "flex-start": Yoga.ALIGN_FLEX_START,
    center: Yoga.ALIGN_CENTER,
    "flex-end": Yoga.ALIGN_FLEX_END,
    stretch: Yoga.ALIGN_STRETCH,
    baseline: Yoga.ALIGN_BASELINE,
    "space-between": Yoga.ALIGN_SPACE_BETWEEN,
    "space-around": Yoga.ALIGN_SPACE_AROUND,
    "space-evenly": Yoga.ALIGN_SPACE_EVENLY,
  }[v]!;
}

function toPosition(v: string | undefined): number {
  if (!v || v === "relative") return Yoga.POSITION_TYPE_RELATIVE;
  if (v === "absolute") return Yoga.POSITION_TYPE_ABSOLUTE;
  return Yoga.POSITION_TYPE_STATIC;
}

function toJustify(v: string): Justify {
  return {
    "flex-start": Yoga.JUSTIFY_FLEX_START,
    center: Yoga.JUSTIFY_CENTER,
    "flex-end": Yoga.JUSTIFY_FLEX_END,
    "space-between": Yoga.JUSTIFY_SPACE_BETWEEN,
    "space-around": Yoga.JUSTIFY_SPACE_AROUND,
    "space-evenly": Yoga.JUSTIFY_SPACE_EVENLY,
  }[v]!;
}

export function isYogaProp(key: string): boolean {
  return Object.hasOwn(YOGA_PROP_SETTERS, key);
}

const RESETTABLE_PROPS = new Set([
  // Already handled undefined in their setters (reset to yoga/Ink default on removal):
  "width",
  "height",
  "maxWidth",
  "maxHeight",
  "aspectRatio",
  "alignContent",
  "top",
  "right",
  "bottom",
  "left",
  // G19: newly resettable — setters now reset to yoga/Ink default on undefined.
  // Defaults: margin/padding/minWidth/minHeight/gap*/columnGap/rowGap → 0;
  //           flexGrow → 0; flexShrink → 1; flexBasis → auto;
  //           flexDirection → ROW; flexWrap → NO_WRAP;
  //           alignItems → STRETCH; alignSelf → AUTO;
  //           justifyContent → FLEX_START; position → RELATIVE.
  // (Matches Ink styles.ts apply blocks + Box.tsx hardcoded defaults.)
  "minWidth",
  "minHeight",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "flexDirection",
  "flexWrap",
  "alignItems",
  "alignSelf",
  "justifyContent",
  "gap",
  "columnGap",
  "rowGap",
  "margin",
  "marginX",
  "marginY",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "padding",
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "position",
  // display: removing/undefining `display` resets to the DEFAULT (visible,
  // DISPLAY_FLEX) — the setter already maps undefined → DISPLAY_FLEX. This is a
  // DELIBERATE divergence from Ink (which hides on a present-undefined `display`):
  // render = f(current props), so a withdrawn prop returns to the default, just
  // like flexDirection/flexWrap (G19). See .agents/docs/ink-divergences.md
  // ("Removing `display` resets to the default").
  "display",
]);

export function applyYogaProp(
  node: YogaCarrier,
  key: string,
  value: unknown,
  prev?: unknown,
): void {
  const setter = YOGA_PROP_SETTERS[key];
  if (!setter) return;
  // Vue calls patchProp with `undefined` for every declared prop a user
  // didn't set. Forwarding undefined to yoga's setters corrupts state:
  // setAlignItems / setFlexDirection / setJustifyContent → 0 (AUTO/COLUMN/
  // FLEX_START), and the dimension setters (setWidth, setMargin, setBorder,
  // …) write NaN. Skip undefined so yoga keeps its documented defaults.
  //
  // Exception: borderStyle is the one prop with intentional undefined
  // semantics — undefined means "no border", which the setter implements
  // by zeroing all four edge widths.
  //
  // G19: RESETTABLE_PROPS setters handle undefined by resetting to the yoga/Ink
  // default. But we only call them when the prop had a real prior value (prev
  // is neither null nor undefined) — this prevents two cases from clobbering
  // legitimately-set props:
  //   1. Vue calls patchProp(el, key, null, undefined) for every declared prop
  //      that is absent on the first mount (old=null, new=undefined).
  //   2. Vue calls patchProp(el, key, null, undefined) for props absent in a
  //      shorthand/longhand sibling (e.g. margin=undefined after marginTop=4).
  // On actual removal the old value is the previously-set number/string, e.g.
  // patchProp(el, 'marginTop', 4, undefined) — prev=4 satisfies the guard.
  // This matches Ink's reconciler which only emits undefined for props that
  // existed in the old vnode and were dropped from the new one.
  //
  // Blocker 2: Vue's HOST renderer passes next=null (not undefined) when a key
  // disappears from a spread props object (e.g. Static spreads `style` into host
  // props, Box forwards). So `value == null` (null OR undefined) is treated as
  // removal — forwarding raw null to a yoga dimension setter would write NaN/0
  // and corrupt state instead of resetting to the documented default.
  if (value == null) {
    if (key === "borderStyle") {
      // borderStyle: null/undefined always means "no border" — fall through to setter.
    } else if (RESETTABLE_PROPS.has(key) && prev !== null && prev !== undefined) {
      // Prop was explicitly removed (defined → null/undefined): reset to yoga/Ink default.
    } else {
      return;
    }
  }
  setter(node.yoga as YogaNode, value);
}

// --- text measure binding ------------------------------------------------

export function bindTextMeasure(text: TuiText): void {
  text.yoga.setMeasureFunc((availableWidth) => {
    const raw = flattenLeaves(text);
    text.measuredCache = raw;

    // Empty text (no children or all-null children) — return zero dimensions
    // so yoga doesn't crash trying to measure an empty string.
    if (raw === "") return { width: 0, height: 0 };

    const natural = measureTextNatural(raw);

    // Text fits into container, no need to wrap.
    if (natural.width <= availableWidth) return natural;

    // When <Box> is shrinking child nodes, yoga asks if we can fit this text
    // node in a sub-1px space. Return the natural size to tell yoga "no, I
    // need my full width". This matches Ink's behavior and prevents text from
    // wrapping to infinite height when given fractional widths.
    if (natural.width >= 1 && availableWidth > 0 && availableWidth < 1) {
      return natural;
    }

    const wrapped = wrapText(raw, availableWidth, text.props.wrap ?? "wrap");
    return measureTextNatural(wrapped.join("\n"));
  });
}

export function markTextDirty(text: TuiText): void {
  text.yoga.markDirty();
}

// Measure func for a standalone <Transform> rendered as an inline text node
// (G58). It squashes the transform's direct inline children (bare strings,
// <Newline>, nested <Text>→virtual-text) the same way bindTextMeasure squashes a
// <Text>'s children. Crucially the transform's OWN fn is NOT applied here —
// matching Ink, where measureTextNode squashes via squashTextNodes (which never
// applies the node's own internal_transform) and the transform runs only at
// Output paint time. So the reserved width is the UNtransformed text width; the
// transform may make the painted text wider/narrower, but that is written into
// the surrounding (wider) container exactly as Ink does.
export function bindTransformMeasure(node: TuiTransform): void {
  (node.yoga as YogaNode).setMeasureFunc((availableWidth) => {
    const raw = flattenTransformLeaves(node);
    if (raw === "") return { width: 0, height: 0 };

    const natural = measureTextNatural(raw);
    if (natural.width <= availableWidth) return natural;
    if (natural.width >= 1 && availableWidth > 0 && availableWidth < 1) {
      return natural;
    }
    const wrapped = wrapText(raw, availableWidth, "wrap");
    return measureTextNatural(wrapped.join("\n"));
  });
}

export function markTransformDirty(node: TuiTransform): void {
  (node.yoga as YogaNode).markDirty();
}
