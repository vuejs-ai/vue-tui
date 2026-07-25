import { type ExtractPublicPropTypes, type PropType } from "vue";
import type { Color } from "./color.ts";

type Percentage = `${number}%`;
type FlexDirection = "row" | "column" | "row-reverse" | "column-reverse";
type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";
type AlignItems = "flex-start" | "center" | "flex-end" | "stretch";
type AlignSelf = "auto" | AlignItems;
type JustifyContent =
  | "flex-start"
  | "center"
  | "flex-end"
  | "space-between"
  | "space-around"
  | "space-evenly";
type AlignContent =
  | "flex-start"
  | "center"
  | "flex-end"
  | "stretch"
  | "space-between"
  | "space-around"
  | "space-evenly";
/** The named frames `cli-boxes` ships. */
type BorderStyleName =
  | "single"
  | "double"
  | "round"
  | "bold"
  | "singleDouble"
  | "doubleSingle"
  | "classic"
  | "arrow";
/**
 * A caller-supplied frame. Every corner and edge is required so a custom frame
 * cannot silently lose a side; each value is one string, not a width.
 */
export interface BorderCharacters {
  readonly topLeft: string;
  readonly top: string;
  readonly topRight: string;
  readonly right: string;
  readonly bottomRight: string;
  readonly bottom: string;
  readonly bottomLeft: string;
  readonly left: string;
}
type BorderStyle = BorderStyleName | BorderCharacters;
type Overflow = "visible" | "hidden";

export const boxProps = {
  flexDirection: String as PropType<FlexDirection>,
  flexWrap: String as PropType<FlexWrap>,
  flexGrow: Number,
  flexShrink: Number,
  flexBasis: [Number, String] as PropType<number | Percentage>,
  alignItems: String as PropType<AlignItems>,
  alignSelf: String as PropType<AlignSelf>,
  alignContent: String as PropType<AlignContent>,
  justifyContent: String as PropType<JustifyContent>,
  gap: Number,
  rowGap: Number,
  columnGap: Number,

  width: [Number, String] as PropType<number | Percentage>,
  height: Number,
  minWidth: Number,
  minHeight: Number,
  maxWidth: Number,
  maxHeight: Number,
  aspectRatio: Number,

  position: String as PropType<"relative" | "absolute" | "static">,
  top: [Number, String] as PropType<number | Percentage>,
  right: [Number, String] as PropType<number | Percentage>,
  bottom: [Number, String] as PropType<number | Percentage>,
  left: [Number, String] as PropType<number | Percentage>,

  margin: Number,
  marginX: Number,
  marginY: Number,
  marginTop: Number,
  marginRight: Number,
  marginBottom: Number,
  marginLeft: Number,
  padding: Number,
  paddingX: Number,
  paddingY: Number,
  paddingTop: Number,
  paddingRight: Number,
  paddingBottom: Number,
  paddingLeft: Number,

  borderStyle: [String, Object] as PropType<BorderStyle>,
  borderTop: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderRight: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderBottom: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderLeft: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderColor: String as PropType<Color>,
  borderTopColor: String as PropType<Color>,
  borderRightColor: String as PropType<Color>,
  borderBottomColor: String as PropType<Color>,
  borderLeftColor: String as PropType<Color>,
  borderDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderTopDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderRightDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderBottomDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderLeftDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderBackgroundColor: String as PropType<Color>,
  borderTopBackgroundColor: String as PropType<Color>,
  borderRightBackgroundColor: String as PropType<Color>,
  borderBottomBackgroundColor: String as PropType<Color>,
  borderLeftBackgroundColor: String as PropType<Color>,
  backgroundColor: String as PropType<Color>,
  overflow: String as PropType<Overflow>,
  overflowX: String as PropType<Overflow>,
  overflowY: String as PropType<Overflow>,
};

/** Props accepted by the public `<Box>` primitive. */
export type BoxProps = ExtractPublicPropTypes<typeof boxProps>;
