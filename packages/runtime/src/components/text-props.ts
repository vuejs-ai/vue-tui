import { type ExtractPublicPropTypes, type PropType } from "vue";
import type { Color } from "./color.ts";

type TextColor = Color | "default";
type WrapMode = "wrap" | "hard" | "truncate" | "truncate-middle" | "truncate-start";
const optionalBoolean = { type: Boolean as PropType<boolean | undefined>, default: undefined };

export const textProps = {
  color: String as PropType<TextColor>,
  backgroundColor: String as PropType<TextColor>,
  dimColor: optionalBoolean,
  bold: optionalBoolean,
  italic: optionalBoolean,
  underline: optionalBoolean,
  strikethrough: optionalBoolean,
  inverse: optionalBoolean,
  wrap: { type: String as PropType<WrapMode>, default: "wrap" },
};

/** Props accepted by the public `<Text>` primitive. */
export type TextProps = ExtractPublicPropTypes<typeof textProps>;
