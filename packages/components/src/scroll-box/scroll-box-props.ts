import type { ExtractPublicPropTypes } from "vue";

/**
 * `ScrollBox` takes no props: it is a bounded viewport that follows the bottom
 * of its content. Drive scrolling through the exposed `ScrollBoxExpose` handle,
 * and wire your own mouse / keyboard to it on the consumer side — the component
 * deliberately ships no built-in input handling (see the decision record).
 */
export const scrollBoxProps = {};

/** Props accepted by `<ScrollBox>`. */
export type ScrollBoxProps = ExtractPublicPropTypes<typeof scrollBoxProps>;

/**
 * Imperative handle exposed by `<ScrollBox>` via `defineExpose`. Grab it with a
 * template ref and drive scrolling from the app. `ScrollBox` listens to no input
 * itself, so the consumer decides how to bind mouse / keyboard to these actions.
 */
export interface ScrollBoxExpose {
  /** Scroll so content line `line` is at the viewport top (clamped). */
  scrollToLine(line: number): void;
  /** Scroll by `lines` relative to the current position (positive = toward the bottom). */
  scrollByLines(lines: number): void;
  /** Jump to the top. */
  scrollToTop(): void;
  /** Jump to the bottom and resume following new content. */
  scrollToBottom(): void;
}
