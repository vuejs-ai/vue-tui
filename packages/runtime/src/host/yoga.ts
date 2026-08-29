import Yoga from "yoga-layout";
import type {
  Node as YogaNode,
  Config as YogaConfig,
  Align,
  FlexDirection,
  Justify,
  MeasureMode,
  Wrap,
} from "yoga-layout";
import type {
  TuiBox,
  TuiContainer,
  TuiNode,
  TuiRoot,
  TuiStatic,
  TuiText,
  TextProps,
} from "./nodes.ts";
import { flattenLeaves, measureTextNatural, wrapText } from "./text-measure.ts";

type YogaCarrier = TuiRoot | TuiBox | TuiText | TuiStatic;

interface TextMeasureResult {
  readonly width: number;
  readonly height: number;
}

interface TextMeasureRequest {
  readonly availableWidth: number;
  readonly widthMode: MeasureMode;
}

interface TextMeasureState {
  cache?: TextMeasureRequest & {
    readonly revision: number;
    readonly wrap: TextProps["wrap"];
    readonly result: TextMeasureResult;
  };
}

let textYogaConfig: YogaConfig | undefined;
let textYogaConfigUsers = 0;

function acquireTextYogaConfig(): YogaConfig {
  if (!textYogaConfig) {
    const config = Yoga.Config.create();
    try {
      // Layout engines resolve flex constraints before their final pixel-grid
      // projection. Keep measured Text's resolved dimensions unrounded so
      // measurement and paint apply the same terminal-cell quantization.
      config.setPointScaleFactor(0);
      textYogaConfig = config;
    } catch (error) {
      config.free();
      throw error;
    }
  }
  textYogaConfigUsers++;
  return textYogaConfig;
}

function releaseTextYogaConfig(): void {
  textYogaConfigUsers--;
  if (textYogaConfigUsers !== 0) return;
  const config = textYogaConfig;
  textYogaConfig = undefined;
  config?.free();
}

// --- yoga node lifecycle seam --------------------------------------------

export function createYogaNode(): YogaNode {
  return Yoga.Node.create();
}

export function freeYogaNode(node: YogaNode): void {
  node.free();
}

// -------------------------------------------------------------------------

function hasYoga(node: TuiNode): node is YogaCarrier {
  return (
    node.type === "root" ||
    node.type === "tui-box" ||
    node.type === "tui-text" ||
    node.type === "tui-static"
  );
}

export function attachYoga(node: YogaCarrier): void {
  if (node.type === "tui-text") {
    const config = acquireTextYogaConfig();
    try {
      node.yoga = Yoga.Node.create(config);
    } catch (error) {
      releaseTextYogaConfig();
      throw error;
    }
  } else {
    node.yoga = createYogaNode();
  }
  // Static nodes are painted via a separate channel (paintIsolated), so they
  // must not occupy space in the dynamic frame's yoga layout.
  if (node.type === "tui-static") {
    (node.yoga as YogaNode).setDisplay(Yoga.DISPLAY_NONE);
  }
  // Box defaults are row direction, shrinkable, and no-wrap. These are set at
  // the yoga level so they work regardless of whether props
  // are passed through Vue's reactive system (which may include undefined
  // overrides or border defaults). User-provided props override these via
  // patchProp which runs after attachYoga.
  if (node.type === "tui-box") {
    (node.yoga as YogaNode).setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
    (node.yoga as YogaNode).setFlexShrink(1);
    (node.yoga as YogaNode).setFlexWrap(Yoga.WRAP_NO_WRAP);
    (node.yoga as YogaNode).setFlexGrow(0);
  }
  // Text defaults are row direction and shrinkable. Although text nodes rarely
  // have yoga-carrying children, applying the defaults here keeps layout
  // consistent for every host construction path.
  if (node.type === "tui-text") {
    (node.yoga as YogaNode).setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
    (node.yoga as YogaNode).setFlexShrink(1);
    (node.yoga as YogaNode).setFlexGrow(0);
  }
}

export function detachYoga(node: YogaCarrier): void {
  try {
    freeYogaNode(node.yoga as YogaNode);
  } finally {
    if (node.type === "tui-text") releaseTextYogaConfig();
  }
}

// Returns the yoga index a child should occupy when added to `parent`.
// Skips any siblings that don't carry a yoga node.
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
  // Apply the public width contract while preserving the private raw-host fallback:
  //   number → setWidth (absolute cells)
  //   a `%` string → setWidthPercent with its complete decimal value
  //   any other private raw-host string → retain the older parseInt fallback
  //   else   → setWidthAuto() — this is the load-bearing fallback (like flexBasis's
  //     setFlexBasisAuto): Vue's [Number, String] prop validation only WARNS on a
  //     bad runtime value (e.g. width={false}/{}/[]) and still forwards it, so
  //     without this branch the raw setWidth(false) throws and crashes render.
  // null/undefined also land in the else branch and reset to auto.
  width: (n, v) => {
    if (typeof v === "number") {
      n.setWidth(v);
    } else if (typeof v === "string") {
      const percentage = v.endsWith("%") ? Number(v.slice(0, -1)) : Number.parseInt(v, 10);
      n.setWidthPercent(percentage);
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
  // Minimum dimensions accept percentage strings or cell numbers. Nullish
  // removal resets to zero; other off-contract values reach Yoga and may throw.
  minWidth: (n, v) =>
    typeof v === "string"
      ? n.setMinWidthPercent(Number.parseInt(v, 10))
      : n.setMinWidth(v == null ? 0 : (v as number)),
  // minHeight follows the same value and reset contract as minWidth.
  minHeight: (n, v) =>
    typeof v === "string"
      ? n.setMinHeightPercent(Number.parseInt(v, 10))
      : n.setMinHeight(v == null ? 0 : (v as number)),
  // Flex removals restore the Box defaults established by attachYoga().
  flexGrow: (n, v) => n.setFlexGrow(v == null ? 0 : (v as number)),
  flexShrink: (n, v) => n.setFlexShrink(v == null ? 1 : (v as number)),
  // flexBasis accepts cell numbers and percentage strings:
  //   number → setFlexBasis (absolute cells)
  //   string → setFlexBasisPercent(Number(v without "%")) — the public
  //     validator admits only canonical percentages and preserves decimals.
  //     Private raw hosts still treat a bare numeric string as a percentage.
  //   else   → setFlexBasisAuto()  — this is the load-bearing fallback: Vue's
  //     [Number, String] prop validation only WARNS on a bad runtime value
  //     (e.g. flexBasis={false}/{}/[]) and still forwards it, so without this
  //     branch setFlexBasis(false) throws during render.
  // null/undefined also lands in the else branch and resets to auto.
  flexBasis: (n, v) => {
    if (typeof v === "number") {
      n.setFlexBasis(v);
    } else if (typeof v === "string") {
      n.setFlexBasisPercent(Number(v.endsWith("%") ? v.slice(0, -1) : v));
    } else {
      n.setFlexBasisAuto();
    }
  },
  // Remaining flex removals restore the local layout defaults.
  flexDirection: (n, v) =>
    n.setFlexDirection(v == null ? Yoga.FLEX_DIRECTION_ROW : toFlexDirection(v as string)),
  flexWrap: (n, v) => n.setFlexWrap(v == null ? Yoga.WRAP_NO_WRAP : toFlexWrap(v as string)),
  alignItems: (n, v) => n.setAlignItems(v == null ? Yoga.ALIGN_STRETCH : toAlign(v as string)),
  alignSelf: (n, v) => n.setAlignSelf(v == null ? Yoga.ALIGN_AUTO : toAlign(v as string)),
  justifyContent: (n, v) =>
    n.setJustifyContent(v == null ? Yoga.JUSTIFY_FLEX_START : toJustify(v as string)),
  // Each physical gutter depends on its axis-specific value and the broad gap.
  // patchProp reconciles the family from current props so withdrawing rowGap or
  // columnGap falls back to a surviving gap instead of leaving a stale zero.
  gap: () => {},
  columnGap: () => {},
  rowGap: () => {},

  // margin/padding families do NOT compute their own edge widths here. Each
  // PHYSICAL edge depends on up to three props together (the specific edge, the
  // axis shorthand, the all-edges shorthand), and per yoga precedence the
  // more-specific edge OVERRIDES the shorthand even when set to 0 — so a single
  // yoga setter that sees one value can't reconcile the family. In particular,
  // withdrawing `marginTop` from `margin={5} marginTop={8}` cannot set
  // EDGE_TOP=0 because that still overrides EDGE_ALL=5. patchProp
  // owns the joint reconciliation via reconcileMarginEdges / reconcilePaddingEdges
  // (below), which read the full el.props and resolve each physical edge with
  // explicit precedence. These no-op entries exist only so isYogaProp still routes
  // margin/padding props through the yoga branch, which also stores them in
  // el.props for reconciliation.
  margin: () => {},
  marginX: () => {},
  marginY: () => {},
  marginTop: () => {},
  marginBottom: () => {},
  marginLeft: () => {},
  marginRight: () => {},

  padding: () => {},
  paddingX: () => {},
  paddingY: () => {},
  paddingTop: () => {},
  paddingBottom: () => {},
  paddingLeft: () => {},
  paddingRight: () => {},

  // borderStyle and the per-edge toggles do NOT compute their own edge widths
  // here: an edge's width depends on BOTH borderStyle and that edge's per-edge
  // prop together, and a yoga setter only sees one value. patchProp owns the
  // joint reconciliation via reconcileBorderEdges (below), which reads the full
  // el.props. These no-op entries exist only
  // so isYogaProp still routes border props through the yoga branch (which also
  // stores them into el.props for the paint pass).
  borderStyle: () => {},
  borderTop: () => {},
  borderBottom: () => {},
  borderLeft: () => {},
  borderRight: () => {},

  // Private raw-host compatibility channel used by Vue's v-show bridge. Any
  // present value other than "flex" hides; removal/nullish input restores the
  // visible default. Public BoxProps intentionally do not expose `display`.
  display: (n, v) =>
    n.setDisplay(v != null && v !== "flex" ? Yoga.DISPLAY_NONE : Yoga.DISPLAY_FLEX),
  // Overflow is a paint-time clip. Calling Yoga setOverflow(HIDDEN) here would
  // also constrain layout and prevent overflow-visible descendants from
  // receiving their intended geometry.
  overflow: (_n, _v) => {},
  // Yoga does not support per-axis overflow; these are accepted silently.
  overflowX: (_n, _v) => {},
  overflowY: (_n, _v) => {},
  // Maximum dimensions accept percentage strings or cell numbers. A nullish
  // removal maps to Yoga's NaN "no maximum" value because setMaxWidth(null)
  // throws; other off-contract values reach Yoga and may throw.
  maxWidth: (n, v) =>
    typeof v === "string"
      ? n.setMaxWidthPercent(Number.parseInt(v, 10))
      : n.setMaxWidth(v == null ? (NaN as never) : (v as number)),
  // maxHeight follows the same value and reset contract as maxWidth.
  maxHeight: (n, v) =>
    typeof v === "string"
      ? n.setMaxHeightPercent(Number.parseInt(v, 10))
      : n.setMaxHeight(v == null ? (NaN as never) : (v as number)),
  aspectRatio: (n, v) =>
    v == null ? n.setAspectRatio(undefined as never) : n.setAspectRatio(v as number),
  alignContent: (n, v) =>
    v == null ? n.setAlignContent(Yoga.ALIGN_FLEX_START) : n.setAlignContent(toAlign(v as string)),
  // Removing position restores relative positioning.
  position: (n, v) => n.setPositionType(toPosition(v as string | undefined)),
  // Position offsets accept percentage strings or cell numbers:
  //   string → setPositionPercent(edge, Number.parseFloat(value)) — so a
  //     bare-numeric string like top="50" is 50% of the container, NOT 50 absolute
  //     cells. parseFloat preserves fractional percentages; dimension strings
  //     use the separate conversion documented above.
  //   else   → setPosition(edge, value) — number falls here; a junk value
  //     (top={false}) reaches Yoga and may throw. Nullish removal maps to Yoga's
  //     NaN auto value because setPosition(edge, null) throws.
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

/** Props whose change requires recomputing the yoga border-edge widths. */
export const BORDER_PROPS = new Set([
  "borderStyle",
  "borderTop",
  "borderBottom",
  "borderLeft",
  "borderRight",
]);

/**
 * Recompute all four Yoga border-edge widths from a Box's complete prop set. The
 * per-side width is `borderStyle ? 1 : 0`, then each edge is forced to 0 when its
 * prop is explicitly `false`. So a per-edge toggle can only SUBTRACT an edge — it
 * can NEVER add width without a borderStyle. This is the joint computation a
 * single yoga setter cannot do (it sees only one value), and it must run on ANY
 * border-prop change, including borderStyle flipping in EITHER direction
 * (set→unset re-zeroes, unset→set re-reserves) — otherwise a per-edge toggle made
 * while borderStyle stays unset would leave a spurious 1-cell inset with no border
 * drawn (the per-edge props default to `true`).
 */
export function reconcileBorderEdges(node: YogaCarrier, props: Record<string, unknown>): void {
  const y = node.yoga as YogaNode;
  const borderWidth = props["borderStyle"] ? 1 : 0;
  y.setBorder(Yoga.EDGE_TOP, props["borderTop"] === false ? 0 : borderWidth);
  y.setBorder(Yoga.EDGE_BOTTOM, props["borderBottom"] === false ? 0 : borderWidth);
  y.setBorder(Yoga.EDGE_LEFT, props["borderLeft"] === false ? 0 : borderWidth);
  y.setBorder(Yoga.EDGE_RIGHT, props["borderRight"] === false ? 0 : borderWidth);
}

/** Props whose change requires recomputing the yoga margin edges. */
export const MARGIN_PROPS = new Set([
  "margin",
  "marginX",
  "marginY",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
]);

/** Props whose change requires recomputing the yoga padding edges. */
export const PADDING_PROPS = new Set([
  "padding",
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
]);

/** Props whose change requires recomputing both physical Yoga gutters. */
export const GUTTER_PROPS = new Set(["gap", "rowGap", "columnGap"]);

// A prop counts as "present" only when its el.props value coerces to a FINITE
// number. Spacing props are typed `number` in box-props.ts; numeric strings are
// still accepted because Vue delivers a static template attribute
// (`<Box margin="5">`) as the string "5".
//
// Three reasons a value FALLS THROUGH (not present → next precedence level
// axis → all → 0, instead of resolving to 0):
//   1. withdrawn prop (null/undefined),
//   2. present-but-non-finite number (NaN/±Infinity from a bad user calc like 0/0),
//      which must retain Yoga's treat-as-unset behavior even though composite
//      edges are explicitly zeroed, and
//   3. an off-contract non-numeric string ("50%", "foo", …). Normalizing these
//      to absent keeps the runtime behavior aligned with the typed number
//      contract. The empty string "" is excluded too,
//      since `Number("") === 0` would otherwise make `marginTop=""` resolve to 0
//      while every other non-numeric string falls through — an inconsistency, not
//      a contract worth keeping.
// (An explicit 0 is finite, so it still counts as present and correctly overrides
// the shorthand to 0 — distinct from the fall-through cases above.)
function present(props: Record<string, unknown>, key: string): boolean {
  const v = props[key];
  return v != null && v !== "" && Number.isFinite(Number(v));
}

/**
 * Recompute all four PHYSICAL margin edges from a box's full prop set. Each edge
 * resolves with most-specific-wins precedence (specific edge → axis → all → 0):
 *   top = marginTop ?? marginY ?? margin ?? 0   (etc.)
 * then the four physical edges are set and the composite edges (ALL/HORIZONTAL/
 * VERTICAL) are ZEROED so nothing layers on top of them.
 *
 * A per-setter mapping cannot work (margin→EDGE_ALL, marginX→
 * EDGE_HORIZONTAL, marginTop→EDGE_TOP, …): an edge depends on up to three props
 * together and a single yoga setter sees only one. Per yoga edge precedence a more
 * specific edge overrides a composite even when set to 0, so resetting a withdrawn
 * `marginTop` to 0 would still beat a surviving `margin={5}`. Resolving every physical
 * edge from el.props and zeroing the composites removes that layering entirely, so
 * a withdrawn override falls back to whatever shorthand still applies.
 *
 * Margin maps left/right to EDGE_START/END; padding uses EDGE_LEFT/RIGHT.
 */
export function reconcileMarginEdges(node: YogaCarrier, props: Record<string, unknown>): void {
  const y = node.yoga as YogaNode;
  const pick = (specific: string, axis: string): number => {
    if (present(props, specific)) return Number(props[specific]);
    if (present(props, axis)) return Number(props[axis]);
    if (present(props, "margin")) return Number(props["margin"]);
    return 0;
  };
  y.setMargin(Yoga.EDGE_TOP, pick("marginTop", "marginY"));
  y.setMargin(Yoga.EDGE_BOTTOM, pick("marginBottom", "marginY"));
  y.setMargin(Yoga.EDGE_START, pick("marginLeft", "marginX"));
  y.setMargin(Yoga.EDGE_END, pick("marginRight", "marginX"));
  // Zero the composites so the four physical edges above are authoritative.
  y.setMargin(Yoga.EDGE_ALL, 0);
  y.setMargin(Yoga.EDGE_HORIZONTAL, 0);
  y.setMargin(Yoga.EDGE_VERTICAL, 0);
}

/**
 * Padding analogue of {@link reconcileMarginEdges}. Same precedence and composite-
 * zeroing, but padding maps left/right to EDGE_LEFT/EDGE_RIGHT (margin uses
 * START/END).
 */
export function reconcilePaddingEdges(node: YogaCarrier, props: Record<string, unknown>): void {
  const y = node.yoga as YogaNode;
  const pick = (specific: string, axis: string): number => {
    if (present(props, specific)) return Number(props[specific]);
    if (present(props, axis)) return Number(props[axis]);
    if (present(props, "padding")) return Number(props["padding"]);
    return 0;
  };
  y.setPadding(Yoga.EDGE_TOP, pick("paddingTop", "paddingY"));
  y.setPadding(Yoga.EDGE_BOTTOM, pick("paddingBottom", "paddingY"));
  y.setPadding(Yoga.EDGE_LEFT, pick("paddingLeft", "paddingX"));
  y.setPadding(Yoga.EDGE_RIGHT, pick("paddingRight", "paddingX"));
  y.setPadding(Yoga.EDGE_ALL, 0);
  y.setPadding(Yoga.EDGE_HORIZONTAL, 0);
  y.setPadding(Yoga.EDGE_VERTICAL, 0);
}

/**
 * Resolve physical row/column gutters with axis-specific-over-broad
 * precedence. Writing the two resolved gutters directly makes reactive
 * withdrawal declarative: removing rowGap reveals gap again.
 */
export function reconcileGutters(node: YogaCarrier, props: Record<string, unknown>): void {
  const y = node.yoga as YogaNode;
  const broad = present(props, "gap") ? Number(props["gap"]) : 0;
  const row = present(props, "rowGap") ? Number(props["rowGap"]) : broad;
  const column = present(props, "columnGap") ? Number(props["columnGap"]) : broad;
  y.setGap(Yoga.GUTTER_ALL, 0);
  y.setGap(Yoga.GUTTER_ROW, row);
  y.setGap(Yoga.GUTTER_COLUMN, column);
}

const RESETTABLE_PROPS = new Set([
  // These setters already restore their local default on removal:
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
  // These properties also restore their local layout defaults on removal.
  // Defaults: margin/padding/minWidth/minHeight/gap*/columnGap/rowGap → 0;
  //           flexGrow → 0; flexShrink → 1; flexBasis → auto;
  //           flexDirection → ROW; flexWrap → NO_WRAP;
  //           alignItems → STRETCH; alignSelf → AUTO;
  //           justifyContent → FLEX_START; position → RELATIVE.
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
  // Removing `display` resets to the visible DISPLAY_FLEX default. Layout is a
  // function of current props, so a withdrawn value cannot retain stale hidden
  // state; flexDirection and flexWrap follow the same reset rule.
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
  // RESETTABLE_PROPS setters restore the local default. Call them only when the
  // prop had a real prior value (prev
  // is neither null nor undefined) — this prevents two cases from clobbering
  // legitimately-set props:
  //   1. Vue calls patchProp(el, key, null, undefined) for every declared prop
  //      that is absent on the first mount (old=null, new=undefined).
  //   2. Vue calls patchProp(el, key, null, undefined) for props absent in a
  //      shorthand/longhand sibling (e.g. margin=undefined after marginTop=4).
  // On actual removal the prior value is the configured number/string, e.g.
  // patchProp(el, 'marginTop', 4, undefined) — prev=4 satisfies the guard.
  //
  // Vue's host renderer passes next=null (not undefined) when a key
  // disappears from a reactive `v-bind` object. So `value == null` (null OR
  // undefined) is treated as
  // removal — forwarding raw null to a yoga dimension setter would write NaN/0
  // and corrupt state instead of resetting to the documented default.
  if (value == null) {
    if (key === "borderStyle") {
      // borderStyle: null/undefined always means "no border" — fall through to setter.
    } else if (RESETTABLE_PROPS.has(key) && prev !== null && prev !== undefined) {
      // Prop was explicitly removed (defined → null/undefined): restore its default.
    } else {
      return;
    }
  }
  setter(node.yoga as YogaNode, value);
}

// --- text measure binding ------------------------------------------------

function toWholeCellWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.max(1, Math.floor(width));
}

export function getTextMeasureCellWidth(
  naturalWidth: number,
  availableWidth: number,
  widthMode: MeasureMode,
): number {
  if (widthMode === Yoga.MEASURE_MODE_UNDEFINED || !Number.isFinite(availableWidth)) {
    return naturalWidth;
  }

  return toWholeCellWidth(availableWidth);
}

export function bindTextMeasure(text: TuiText): void {
  const state: TextMeasureState = {};
  text.yoga.setMeasureFunc((availableWidth, widthMode) => {
    const wrap = text.props.wrap;

    if (
      state.cache?.revision === text.textRevision &&
      state.cache.availableWidth === availableWidth &&
      state.cache.widthMode === widthMode &&
      state.cache.wrap === wrap
    ) {
      return state.cache.result;
    }
    const raw = flattenLeaves(text);

    const remember = (result: TextMeasureResult): TextMeasureResult => {
      state.cache = {
        revision: text.textRevision,
        availableWidth,
        widthMode,
        wrap,
        result,
      };
      return result;
    };

    // Empty text (no children or all-null children) — return zero dimensions
    // so yoga doesn't crash trying to measure an empty string.
    if (raw === "") {
      return remember({ width: 0, height: 0 });
    }

    const natural = measureTextNatural(raw);

    // A terminal can only paint complete cells. A positive fractional
    // constraint therefore gets the conservative whole-cell budget it already
    // contains; a sub-cell allocation still gets one cell. This is a pure
    // function of the measure request: final absolute offsets and callback
    // order never feed another layout pass.
    const terminalCellWidth = getTextMeasureCellWidth(natural.width, availableWidth, widthMode);

    // Text fits into container, no need to wrap.
    if (natural.width <= terminalCellWidth) {
      return remember(natural);
    }

    const wrapped = wrapText(raw, terminalCellWidth, wrap ?? "wrap");
    const result = measureTextNatural(wrapped.join("\n"));
    return remember(result);
  });
}

/** Whole-cell width shared by measurement and paint. */
export function getTextTerminalCellWidth(text: TuiText): number {
  const layout = text.yoga.getComputedLayout();
  let width = toWholeCellWidth(layout.width);
  // Use Yoga parentage, not host-tree parentage: Static temporarily moves its
  // children into an isolated layout tree without changing DOM-style links.
  const parent = text.yoga.getParent();
  if (!parent) return width;

  const parentLayout = parent.getComputedLayout();
  const rightInset =
    parent.getComputedBorder(Yoga.EDGE_RIGHT) + parent.getComputedPadding(Yoga.EDGE_RIGHT);
  // Paint places Text at floor(left), so clamp against the parent's integral
  // right content edge in that same coordinate system. Flooring the fractional
  // remainder as one value would lose the last valid cell for a Text spanning
  // 9.23..10: it paints from cell 9 and owns that cell.
  const parentRight = Math.floor(parentLayout.width - rightInset);
  const parentRemainder = Math.max(0, parentRight - Math.floor(layout.left));
  width = Math.min(width, parentRemainder);
  return width;
}

export function markTextDirty(text: TuiText): void {
  text.textRevision++;
  text.yoga.markDirty();
}
