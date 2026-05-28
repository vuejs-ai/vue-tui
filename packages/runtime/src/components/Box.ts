import { defineComponent, h, inject, type PropType } from "vue";
import { AppContextKey } from "../context.ts";
import type { WithChildren } from "./with-children.ts";

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

const BoxImpl = defineComponent({
  name: "Box",
  props: {
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

    borderStyle: String as PropType<BorderStyle>,
    borderColor: [String, Array],
    borderDimColor: Boolean,
    borderTopDimColor: Boolean,
    borderBottomDimColor: Boolean,
    borderLeftDimColor: Boolean,
    borderRightDimColor: Boolean,
    borderTop: { type: Boolean, default: true },
    borderBottom: { type: Boolean, default: true },
    borderLeft: { type: Boolean, default: true },
    borderRight: { type: Boolean, default: true },
    borderTopColor: [String, Array],
    borderBottomColor: [String, Array],
    borderLeftColor: [String, Array],
    borderRightColor: [String, Array],
    borderBackgroundColor: [String, Array],
    borderTopBackgroundColor: [String, Array],
    borderBottomBackgroundColor: [String, Array],
    borderLeftBackgroundColor: [String, Array],
    borderRightBackgroundColor: [String, Array],

    backgroundColor: [String, Array],
    overflow: String as PropType<"visible" | "hidden">,
    overflowX: String as PropType<"visible" | "hidden">,
    overflowY: String as PropType<"visible" | "hidden">,
    display: String as PropType<"flex" | "none">,

    ariaLabel: String,
    ariaHidden: Boolean,
    ariaRole: String as PropType<AriaRole>,
    ariaState: Object as PropType<AriaState>,
  },
  setup(props, { slots }) {
    const appCtx = inject(AppContextKey, null);

    return () => {
      const isScreenReaderEnabled = appCtx?.isScreenReaderEnabled ?? false;

      // When screen reader is enabled and aria-hidden is set, render nothing.
      if (isScreenReaderEnabled && props.ariaHidden) {
        return null;
      }

      const ariaLabel = props.ariaLabel;
      const label = ariaLabel ? h("text", null, ariaLabel) : undefined;

      return h("box", props as never, isScreenReaderEnabled && label ? [label] : slots.default?.());
    };
  },
});

export const Box = BoxImpl as WithChildren<typeof BoxImpl>;
