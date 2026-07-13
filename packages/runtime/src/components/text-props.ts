import { type ExtractPublicPropTypes, type PropType } from "vue";
import { rejectedMouseListenerProps } from "./rejected-mouse-listeners.ts";

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
  ...rejectedMouseListenerProps,
};

/** Props accepted by `<Text>` — the vue-tui analogue of Ink's `TextProps`. */
export type TextProps = ExtractPublicPropTypes<typeof textProps>;
