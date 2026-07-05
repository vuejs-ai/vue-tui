import { type ExtractPublicPropTypes, type PropType } from "vue";
import cliBoxes from "cli-boxes";
import type { MouseHandlerProps } from "../mouse/events.ts";

type Spacing = number;
type FlexDirection = "row" | "row-reverse" | "column" | "column-reverse";
type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";
type Align = "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
type AlignSelf = "auto" | "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
type AlignContent =
  | "flex-start"
  | "center"
  | "flex-end"
  | "stretch"
  | "space-between"
  | "space-around"
  | "space-evenly";
type Justify =
  | "flex-start"
  | "center"
  | "flex-end"
  | "space-between"
  | "space-around"
  | "space-evenly";
type BorderStyle =
  | "single"
  | "double"
  | "round"
  | "bold"
  | "singleDouble"
  | "doubleSingle"
  | "classic"
  | "arrow";

// Matches the shape of the cliBoxes value type — the same alias used in paint.ts.
// Exported so consumers can type their custom border objects (Ink parity, G13).
export type BoxStyle = (typeof cliBoxes)[keyof cliBoxes.Boxes];

// The layout-only subset of BoxProps — exported so `<Static>` (and consumers) can
// type a `style` object against the same flex/spacing/size keys a `<Box>` accepts,
// without the color/border/aria surface. (Type aliases hoist, so referencing
// BoxProps here — defined at the bottom of this file — is fine.)
export type BoxLayoutStyle = Pick<
  BoxProps,
  | "flexDirection"
  | "flexGrow"
  | "flexShrink"
  | "flexBasis"
  | "flexWrap"
  | "alignItems"
  | "alignSelf"
  | "justifyContent"
  | "gap"
  | "columnGap"
  | "rowGap"
  | "width"
  | "height"
  | "minWidth"
  | "minHeight"
  | "maxWidth"
  | "maxHeight"
  | "aspectRatio"
  | "alignContent"
  | "position"
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "margin"
  | "marginX"
  | "marginY"
  | "marginTop"
  | "marginBottom"
  | "marginLeft"
  | "marginRight"
  | "padding"
  | "paddingX"
  | "paddingY"
  | "paddingTop"
  | "paddingBottom"
  | "paddingLeft"
  | "paddingRight"
  | "overflow"
  | "overflowX"
  | "overflowY"
  | "display"
>;

export type AriaRole =
  | "button"
  | "checkbox"
  | "combobox"
  | "list"
  | "listbox"
  | "listitem"
  | "menu"
  | "menuitem"
  | "option"
  | "progressbar"
  | "radio"
  | "radiogroup"
  | "tab"
  | "tablist"
  | "table"
  | "textbox"
  | "timer"
  | "toolbar";

export interface AriaState {
  busy?: boolean;
  checked?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  multiline?: boolean;
  multiselectable?: boolean;
  readonly?: boolean;
  required?: boolean;
  selected?: boolean;
}

export const boxProps = {
  flexDirection: String as PropType<FlexDirection>,
  flexGrow: Number,
  flexShrink: Number,
  flexBasis: [Number, String],
  flexWrap: String as PropType<FlexWrap>,
  alignItems: String as PropType<Align>,
  alignSelf: String as PropType<AlignSelf>,
  justifyContent: String as PropType<Justify>,
  gap: Number,
  columnGap: Number,
  rowGap: Number,

  width: [Number, String],
  height: [Number, String],
  minWidth: [Number, String],
  minHeight: [Number, String],
  maxWidth: [Number, String],
  maxHeight: [Number, String],
  aspectRatio: Number,
  alignContent: String as PropType<AlignContent>,
  position: String as PropType<"absolute" | "relative" | "static">,
  top: [Number, String],
  right: [Number, String],
  bottom: [Number, String],
  left: [Number, String],

  margin: Number as PropType<Spacing>,
  marginX: Number,
  marginY: Number,
  marginTop: Number,
  marginBottom: Number,
  marginLeft: Number,
  marginRight: Number,
  padding: Number,
  paddingX: Number,
  paddingY: Number,
  paddingTop: Number,
  paddingBottom: Number,
  paddingLeft: Number,
  paddingRight: Number,

  // Accept either a preset name string or a full custom BoxStyle object (Ink parity, G13).
  // Ink types borderStyle as `keyof Boxes | BoxStyle`; we mirror that here.
  borderStyle: [String, Object] as PropType<BorderStyle | BoxStyle>,
  borderColor: String,
  // `default: undefined` is intentional and load-bearing: Vue's boolean-casting
  // rule coerces absent Boolean props to `false` only when there is no explicit
  // default. Adding `default: undefined` suppresses that coercion so absent
  // per-edge dim props arrive in the paint pass as `undefined`, not `false`.
  // This lets `edgeDim = (perEdge ?? generalDim)` correctly fall back to the
  // general value only when the per-edge prop was truly omitted — mirroring
  // Ink render-border.ts:54 which uses real-undefined via React's prop model
  // (G16). The `Boolean` type is kept so Vue still accepts bare-attribute
  // `<Box borderDimColor>` in templates (coerces `""` → `true`) and passes
  // TypeScript type-checking for consumers.
  borderDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderTopDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderBottomDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderLeftDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderRightDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderTop: { type: Boolean, default: true },
  borderBottom: { type: Boolean, default: true },
  borderLeft: { type: Boolean, default: true },
  borderRight: { type: Boolean, default: true },
  borderTopColor: String,
  borderBottomColor: String,
  borderLeftColor: String,
  borderRightColor: String,
  borderBackgroundColor: String,
  borderTopBackgroundColor: String,
  borderBottomBackgroundColor: String,
  borderLeftBackgroundColor: String,
  borderRightBackgroundColor: String,

  backgroundColor: String,
  overflow: String as PropType<"visible" | "hidden">,
  overflowX: String as PropType<"visible" | "hidden">,
  overflowY: String as PropType<"visible" | "hidden">,
  display: String as PropType<"flex" | "none">,

  ariaLabel: String,
  ariaHidden: Boolean,
  ariaRole: String as PropType<AriaRole>,
  ariaState: Object as PropType<AriaState>,
  onMousedown: Function as PropType<MouseHandlerProps["onMousedown"]>,
  onMouseup: Function as PropType<MouseHandlerProps["onMouseup"]>,
  onClick: Function as PropType<MouseHandlerProps["onClick"]>,
  onWheel: Function as PropType<MouseHandlerProps["onWheel"]>,
};

/** Props accepted by `<Box>` — the vue-tui analogue of Ink's `BoxProps`. */
export type BoxProps = ExtractPublicPropTypes<typeof boxProps> & MouseHandlerProps;
