import type { ExtractPublicPropTypes, PropType } from "vue";

const rejectedMouseListenerNames = ["onMousedown", "onMouseup", "onClick", "onWheel"] as const;

/**
 * `ScrollBox` takes no props: it is a bounded viewport that follows the bottom
 * of its content. Drive scrolling through the exposed `ScrollBoxExpose` handle,
 * and wire your own mouse / keyboard to it on the consumer side — the component
 * deliberately ships no built-in input handling (see the decision record).
 */
export const scrollBoxProps = {
  onMousedown: null as unknown as PropType<never>,
  onMouseup: null as unknown as PropType<never>,
  onClick: null as unknown as PropType<never>,
  onWheel: null as unknown as PropType<never>,
};

export function assertNoRejectedMouseListeners(rawProps: Record<string, unknown> | null): true {
  for (const name of rejectedMouseListenerNames) {
    if (rawProps && Object.prototype.hasOwnProperty.call(rawProps, name)) {
      throw new Error(
        `<ScrollBox> does not accept the removed mouse listener "${name}". ` +
          `Use the mouse composables from "@vue-tui/runtime/fullscreen".`,
      );
    }
  }
  return true;
}

/** Props accepted by `<ScrollBox>`. */
export type ScrollBoxProps = ExtractPublicPropTypes<typeof scrollBoxProps>;

/**
 * Imperative handle exposed by `<ScrollBox>` via `defineExpose`. Grab it with a
 * template ref and drive scrolling from the app. `ScrollBox` listens to no input
 * itself, so the consumer decides how to bind mouse / keyboard to these actions.
 * Every method returns `true` only when the effective top content line changes
 * synchronously after flooring and clamping. A `false` result from
 * `scrollToBottom()` can still re-arm following when the viewport is already at
 * the bottom.
 */
export interface ScrollBoxExpose {
  /** Scroll so finite content line `line` is at the viewport top (floored and clamped). */
  scrollToLine(line: number): boolean;
  /** Scroll by a finite number of `lines` (`+` = toward the bottom). */
  scrollByLines(lines: number): boolean;
  /** Jump to the top. */
  scrollToTop(): boolean;
  /** Jump to the bottom and resume following new content. */
  scrollToBottom(): boolean;
}
