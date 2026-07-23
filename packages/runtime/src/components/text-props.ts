import { type ExtractPublicPropTypes, type PropType } from "vue";
import type { Color } from "./color.ts";

type TextColor = Color | "revert" | "initial";
type WrapMode = "wrap" | "truncate";

export const textProps = {
  color: String as PropType<TextColor>,
  backgroundColor: String as PropType<Color>,
  dimColor: Boolean,
  bold: Boolean,
  wrap: { type: String as PropType<WrapMode>, default: "wrap" },
};

/** Props accepted by the public `<Text>` primitive. */
export type TextProps = ExtractPublicPropTypes<typeof textProps>;
