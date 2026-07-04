import type { ExtractPublicPropTypes } from "vue";

export const scrollBoxProps = {
  /**
   * Enable mouse-wheel scrolling. Off by default: enabling terminal mouse
   * tracking suppresses the terminal's native text selection window-wide
   * (users bypass with Shift).
   */
  wheel: Boolean,
  /** Enable keyboard scrolling (PageUp / PageDown). */
  keyboard: Boolean,
  /** Lines to scroll per wheel event. */
  linesPerWheel: { type: Number, default: 3 },
};

/** Props accepted by `<ScrollBox>`. */
export type ScrollBoxProps = ExtractPublicPropTypes<typeof scrollBoxProps>;
