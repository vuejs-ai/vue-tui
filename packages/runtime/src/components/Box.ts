import { defineComponent, h, type PropType } from "vue";

type Spacing = number;
type FlexDirection = "row" | "row-reverse" | "column" | "column-reverse";
type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";
type Align = "flex-start" | "center" | "flex-end" | "stretch";
type AlignSelf = "auto" | "flex-start" | "center" | "flex-end";
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

export const Box = defineComponent({
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
    borderTop: { type: Boolean, default: true },
    borderBottom: { type: Boolean, default: true },
    borderLeft: { type: Boolean, default: true },
    borderRight: { type: Boolean, default: true },
    borderTopColor: [String, Array],
    borderBottomColor: [String, Array],
    borderLeftColor: [String, Array],
    borderRightColor: [String, Array],

    backgroundColor: [String, Array],
    overflow: String as PropType<"visible" | "hidden">,
    overflowX: String as PropType<"visible" | "hidden">,
    overflowY: String as PropType<"visible" | "hidden">,
    display: String as PropType<"flex" | "none">,
  },
  setup(props, { slots }) {
    return () => h("box", props as never, slots.default?.());
  },
});
