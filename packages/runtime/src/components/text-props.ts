import { type ExtractPublicPropTypes, type PropType } from "vue";
import type { MouseHandlerProps } from "../mouse/events.ts";

type WrapMode =
  | "wrap"
  | "hard"
  | "truncate"
  | "truncate-end"
  | "truncate-middle"
  | "truncate-start";

export const textProps = {
  color: String,
  backgroundColor: String,
  dimColor: Boolean,
  bold: Boolean,
  italic: Boolean,
  underline: Boolean,
  strikethrough: Boolean,
  inverse: Boolean,
  wrap: { type: String as PropType<WrapMode>, default: "wrap" },
  ariaLabel: String,
  ariaHidden: Boolean,
  onMousedown: Function as PropType<MouseHandlerProps["onMousedown"]>,
  onMouseup: Function as PropType<MouseHandlerProps["onMouseup"]>,
  onClick: Function as PropType<MouseHandlerProps["onClick"]>,
  onWheel: Function as PropType<MouseHandlerProps["onWheel"]>,
};

/** Props accepted by `<Text>` — the vue-tui analogue of Ink's `TextProps`. */
export type TextProps = ExtractPublicPropTypes<typeof textProps> & MouseHandlerProps;
