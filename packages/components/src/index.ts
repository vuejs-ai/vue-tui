import NewlineSfc from "./newline/newline.vue";
import ScrollBoxSfc from "./scroll-box/scroll-box.vue";
import SpacerSfc from "./spacer/spacer.vue";
import SpinnerSfc from "./spinner/spinner.vue";
import type { PublicComponent, PublicLeafComponent } from "./public-component.ts";
import type { NewlineProps } from "./newline/newline-props.ts";
import type { ScrollBoxExpose, ScrollBoxProps } from "./scroll-box/scroll-box-props.ts";
import type { SpinnerProps } from "./spinner/spinner-props.ts";

// Keep the public constructor independent from the Vue patch release used to
// build this package. Generated DefineComponent arity is not a product API.
/**
 * Bounded viewport that follows the bottom of its content until scrolled away.
 *
 * - No props. Drive it through the `ScrollBoxExpose` handle; each method returns
 *   whether the top line changed.
 * - Passive by design: no wheel or keyboard handling, so wire your own
 *   `useInput()`. Mouse listener props are rejected.
 *
 * @example Scroll with the arrow keys
 * ```tsx
 * const view = shallowRef<ScrollBoxExpose | null>(null);
 * useInput((event) => {
 *   if (event.type !== "key") return;
 *   if (event.key.name === "up") view.value?.scrollByLines(-1);
 *   if (event.key.name === "down") view.value?.scrollByLines(1);
 * });
 * return () => <ScrollBox ref={view}><Log /></ScrollBox>;
 * ```
 */
export const ScrollBox = ScrollBoxSfc as unknown as PublicComponent<
  ScrollBoxProps,
  ScrollBoxExpose
>;
export type { ScrollBoxProps, ScrollBoxExpose };

/**
 * Animated loading indicator with an optional label.
 *
 * - `type` picks a preset (default `"dots"`); `frames` replaces it with custom
 *   frames.
 * - The timer runs from mount to unmount, so `v-if` is how you pause it.
 *
 * @example Preset with a label
 * ```vue
 * <Spinner label="Building" color="cyan" />
 * ```
 *
 * @example Custom frames
 * ```vue
 * <Spinner :frames="['<', '^', '>', 'v']" :interval="120" />
 * ```
 */
export const Spinner = SpinnerSfc as unknown as PublicLeafComponent<SpinnerProps>;
export type { SpinnerProps };

/**
 * Emit newline characters inside a `<Text>`.
 *
 * - Produces characters, not layout — it must sit inside a `<Text>`.
 * - For space between boxes prefer Box `margin` or `gap`, which layout can reason
 *   about.
 *
 * @example Separate two paragraphs
 * ```vue
 * <Text>
 *   First<Newline :count="2" />Second
 * </Text>
 * ```
 */
export const Newline = NewlineSfc as unknown as PublicLeafComponent<NewlineProps>;
export type { NewlineProps };

/**
 * A growing `Box` that eats the free space along the main axis.
 *
 * - Exactly `<Box flexGrow={1} />`, named for intent. No props.
 * - Follows the parent's `flexDirection`.
 *
 * @example Push a status to the right edge
 * ```tsx
 * <Box width="100%">
 *   <Text>file.ts</Text>
 *   <Spacer />
 *   <Text color="green">saved</Text>
 * </Box>
 * ```
 */
export const Spacer = SpacerSfc as unknown as PublicLeafComponent<Record<string, never>>;
