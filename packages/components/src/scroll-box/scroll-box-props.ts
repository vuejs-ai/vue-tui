import type { ExtractPublicPropTypes } from "vue";

export const scrollBoxProps = {
  isActive: { type: Boolean, default: true },
  enableMouse: { type: Boolean, default: true },
  enableKeyboard: Boolean,
  wheelLines: { type: Number, default: 3 },
};

/** Props accepted by `<ScrollBox>`. */
export type ScrollBoxProps = ExtractPublicPropTypes<typeof scrollBoxProps>;
