import { type ExtractPublicPropTypes, type PropType } from "vue";
import type { Color } from "./color.ts";

type FlexDirection = "row" | "column";
type AlignItems = "center" | "stretch";
type JustifyContent = "flex-start" | "center" | "space-between";
type PercentageWidth = `${number}%`;
type BorderStyle = "single" | "round";

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
  flexBasis: Number,
  alignItems: String as PropType<AlignItems>,
  justifyContent: String as PropType<JustifyContent>,
  gap: Number,

  width: [Number, String] as PropType<number | PercentageWidth>,
  height: Number,
  minWidth: Number,
  minHeight: Number,
  position: String as PropType<"absolute">,
  top: Number,
  left: Number,

  marginTop: Number,
  paddingTop: Number,
  paddingBottom: Number,
  paddingLeft: Number,
  paddingRight: Number,

  borderStyle: String as PropType<BorderStyle>,
  borderColor: String as PropType<Color>,
  backgroundColor: String as PropType<Color>,
  overflowY: String as PropType<"visible" | "hidden">,
  display: String as PropType<"flex" | "none">,

  ariaLabel: String,
  ariaHidden: Boolean,
  ariaRole: String as PropType<AriaRole>,
  ariaState: Object as PropType<AriaState>,
};

/** Props accepted by the public `<Box>` primitive. */
export type BoxProps = ExtractPublicPropTypes<typeof boxProps>;
