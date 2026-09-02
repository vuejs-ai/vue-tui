import TextSfc from "../vue/components/text.vue";
import type { PublicComponent } from "../vue/components/with-children.ts";
import type { TextProps } from "../vue/components/text-props.ts";

export { createApp, type TuiApp, type MountOptions } from "../render.ts";
export { renderToString, type RenderToStringOptions } from "../render-to-string.ts";
export type { ColorProfile } from "../color-profile.ts";

// Publish only the stable author-facing constructor shape. Exposing the SFC's
// generated `DefineComponent` type bakes the build-time Vue patch release's
// private generic arity into our tarball and breaks other supported Vue patches.
export { Box } from "../vue/components/public-box.ts";
export type { BoxProps } from "../vue/components/box-props.ts";
export type { Color } from "../vue/components/color.ts";
/**
 * Terminal text: the only component that renders characters.
 *
 * - All text must sit inside a `<Text>`; a bare string in a `<Box>` is not
 *   renderable.
 * - Nested spans inherit per channel; `color="default"` resets only that channel.
 * - The six modifiers are three-state: omitted inherits, `true` on, `false` off.
 * - The outermost `textAlign` and `wrap` govern composed content; alignment is
 *   applied to every physical line after wrapping or truncation.
 *
 * @example Compose styled spans
 * ```tsx
 * <Text>
 *   Count: <Text bold color="green">{count}</Text>
 *   <Text dimColor> (↑/↓ to change)</Text>
 * </Text>
 * ```
 *
 * @example Truncate a long path to one line
 * ```tsx
 * <Text wrap="truncate-start">{longPath}</Text>
 * ```
 */
export const Text = TextSfc as unknown as PublicComponent<TextProps>;
export type { TextProps } from "../vue/components/text-props.ts";

export { useApp, type UseAppReturn } from "../vue/composables/useApp.ts";
export { useFocus, type FocusTarget, type UseFocusReturn } from "../vue/composables/useFocus.ts";
export { useInput } from "../vue/composables/useInput.ts";
export type { TuiInputEvent, TuiKey, TuiKeyName } from "../vue/public-input.ts";
export { useStdin, type UseStdinReturn } from "../vue/composables/useStdin.ts";
export { useLayoutSize, type UseLayoutSizeReturn } from "../vue/composables/use-layout-size.ts";
export { useBoxMetrics, type UseBoxMetricsReturn } from "../vue/composables/use-box-metrics.ts";
// `measureText` / `measureTextNatural` remain private because they operate on
// renderer-owned layout details rather than a stable application-facing fact.
