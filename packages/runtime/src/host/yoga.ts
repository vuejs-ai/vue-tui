import Yoga from "yoga-layout";
import type { Node as YogaNode, Align, FlexDirection, Justify, Wrap } from "yoga-layout";
import type { TuiBox, TuiContainer, TuiNode, TuiRoot, TuiStatic, TuiText } from "./nodes.ts";

type YogaCarrier = TuiRoot | TuiBox | TuiText | TuiStatic;

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
    node.type === "root" || node.type === "box" || node.type === "text" || node.type === "static"
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
}

export function detachYoga(node: YogaCarrier): void {
  freeYogaNode(node.yoga as YogaNode);
}

// Returns the yoga index a child should occupy when added to `parent`.
// Skips any siblings that don't carry a yoga node (virtual-text, transform).
function yogaIndexFor(parent: TuiContainer, child: TuiNode): number {
  let yIdx = 0;
  for (const sibling of parent.children) {
    if (sibling === child) return yIdx;
    if (hasYoga(sibling)) yIdx++;
  }
  return yIdx;
}

export function insertYogaChild(parent: TuiContainer, child: TuiNode, _domIndex: number): void {
  if (!hasYoga(parent) || !hasYoga(child)) return;
  const yIdx = yogaIndexFor(parent, child);
  (parent.yoga as YogaNode).insertChild(child.yoga as YogaNode, yIdx);
}

export function removeYogaChild(parent: TuiContainer, child: TuiNode): void {
  if (!hasYoga(parent) || !hasYoga(child)) return;
  (parent.yoga as YogaNode).removeChild(child.yoga as YogaNode);
}

// --- prop application ----------------------------------------------------

const YOGA_PROP_SETTERS: Record<string, (n: YogaNode, v: unknown) => void> = {
  width: (n, v) =>
    v === undefined ? n.setWidth("auto") : n.setWidth(v as number | "auto" | `${number}%`),
  height: (n, v) =>
    v === undefined ? n.setHeight("auto") : n.setHeight(v as number | "auto" | `${number}%`),
  minWidth: (n, v) => n.setMinWidth(v as number | `${number}%`),
  minHeight: (n, v) => n.setMinHeight(v as number | `${number}%`),
  flexGrow: (n, v) => n.setFlexGrow(v as number),
  flexShrink: (n, v) => n.setFlexShrink(v as number),
  flexBasis: (n, v) => n.setFlexBasis(v as number | "auto" | `${number}%`),
  flexDirection: (n, v) => n.setFlexDirection(toFlexDirection(v as string)),
  flexWrap: (n, v) => n.setFlexWrap(toFlexWrap(v as string)),
  alignItems: (n, v) => n.setAlignItems(toAlign(v as string)),
  alignSelf: (n, v) => n.setAlignSelf(toAlign(v as string)),
  justifyContent: (n, v) => n.setJustifyContent(toJustify(v as string)),
  gap: (n, v) => n.setGap(Yoga.GUTTER_ALL, v as number),
  columnGap: (n, v) => n.setGap(Yoga.GUTTER_COLUMN, v as number),
  rowGap: (n, v) => n.setGap(Yoga.GUTTER_ROW, v as number),

  margin: (n, v) => n.setMargin(Yoga.EDGE_ALL, v as number),
  marginX: (n, v) => {
    n.setMargin(Yoga.EDGE_LEFT, v as number);
    n.setMargin(Yoga.EDGE_RIGHT, v as number);
  },
  marginY: (n, v) => {
    n.setMargin(Yoga.EDGE_TOP, v as number);
    n.setMargin(Yoga.EDGE_BOTTOM, v as number);
  },
  marginTop: (n, v) => n.setMargin(Yoga.EDGE_TOP, v as number),
  marginBottom: (n, v) => n.setMargin(Yoga.EDGE_BOTTOM, v as number),
  marginLeft: (n, v) => n.setMargin(Yoga.EDGE_LEFT, v as number),
  marginRight: (n, v) => n.setMargin(Yoga.EDGE_RIGHT, v as number),

  padding: (n, v) => n.setPadding(Yoga.EDGE_ALL, v as number),
  paddingX: (n, v) => {
    n.setPadding(Yoga.EDGE_LEFT, v as number);
    n.setPadding(Yoga.EDGE_RIGHT, v as number);
  },
  paddingY: (n, v) => {
    n.setPadding(Yoga.EDGE_TOP, v as number);
    n.setPadding(Yoga.EDGE_BOTTOM, v as number);
  },
  paddingTop: (n, v) => n.setPadding(Yoga.EDGE_TOP, v as number),
  paddingBottom: (n, v) => n.setPadding(Yoga.EDGE_BOTTOM, v as number),
  paddingLeft: (n, v) => n.setPadding(Yoga.EDGE_LEFT, v as number),
  paddingRight: (n, v) => n.setPadding(Yoga.EDGE_RIGHT, v as number),

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

  display: (n, v) => n.setDisplay(v === "none" ? Yoga.DISPLAY_NONE : Yoga.DISPLAY_FLEX),
  // Ink does NOT call setOverflow on yoga — it only clips visually in paint.
  // Calling setOverflow(HIDDEN) would prevent nodes from expanding beyond
  // their bounds during layout, which differs from Ink's behavior.
  overflow: (_n, _v) => {},
  // Yoga does not support per-axis overflow; these are accepted silently.
  overflowX: (_n, _v) => {},
  overflowY: (_n, _v) => {},
  maxWidth: (n, v) =>
    v === undefined ? n.setMaxWidth(NaN as never) : n.setMaxWidth(v as number | `${number}%`),
  maxHeight: (n, v) =>
    v === undefined ? n.setMaxHeight(NaN as never) : n.setMaxHeight(v as number | `${number}%`),
  aspectRatio: (n, v) =>
    v === undefined ? n.setAspectRatio(undefined as never) : n.setAspectRatio(v as number),
  alignContent: (n, v) =>
    v === undefined
      ? n.setAlignContent(Yoga.ALIGN_FLEX_START)
      : n.setAlignContent(toAlign(v as string)),
  position: (n, v) => n.setPositionType(toPosition(v as string)),
  top: (n, v) =>
    v === undefined
      ? n.setPosition(Yoga.EDGE_TOP, NaN as never)
      : n.setPosition(Yoga.EDGE_TOP, v as number | `${number}%`),
  right: (n, v) =>
    v === undefined
      ? n.setPosition(Yoga.EDGE_RIGHT, NaN as never)
      : n.setPosition(Yoga.EDGE_RIGHT, v as number | `${number}%`),
  bottom: (n, v) =>
    v === undefined
      ? n.setPosition(Yoga.EDGE_BOTTOM, NaN as never)
      : n.setPosition(Yoga.EDGE_BOTTOM, v as number | `${number}%`),
  left: (n, v) =>
    v === undefined
      ? n.setPosition(Yoga.EDGE_LEFT, NaN as never)
      : n.setPosition(Yoga.EDGE_LEFT, v as number | `${number}%`),
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
]);

export function applyYogaProp(node: YogaCarrier, key: string, value: unknown): void {
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
  if (value === undefined && key !== "borderStyle" && !RESETTABLE_PROPS.has(key)) return;
  setter(node.yoga as YogaNode, value);
}

// --- text measure binding ------------------------------------------------

import { flattenLeaves, measureText } from "./text-measure.ts";

export function bindTextMeasure(text: TuiText): void {
  text.yoga.setMeasureFunc((availableWidth) => {
    const raw = flattenLeaves(text);
    text.measuredCache = raw;

    // Empty text (no children or all-null children) — return zero dimensions
    // so yoga doesn't crash trying to measure an empty string.
    if (raw === "") return { width: 0, height: 0 };

    const natural = measureText(raw, Infinity, text.props.wrap ?? "wrap");

    // Text fits into container, no need to wrap.
    if (natural.width <= availableWidth) return natural;

    // When <Box> is shrinking child nodes, yoga asks if we can fit this text
    // node in a sub-1px space. Return the natural size to tell yoga "no, I
    // need my full width". This matches Ink's behavior and prevents text from
    // wrapping to infinite height when given fractional widths.
    if (natural.width >= 1 && availableWidth > 0 && availableWidth < 1) {
      return natural;
    }

    return measureText(raw, availableWidth, text.props.wrap ?? "wrap");
  });
}

export function markTextDirty(text: TuiText): void {
  text.yoga.markDirty();
}
