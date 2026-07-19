import TextSfc from "./components/text.vue";
import type { PublicComponent } from "./components/with-children.ts";
import type { TextProps } from "./components/text-props.ts";

export { createApp, type TuiApp, type MountOptions } from "./render.ts";
export { renderToString, type RenderToStringOptions } from "./render-to-string.ts";

// Publish only the stable author-facing constructor shape. Exposing the SFC's
// generated `DefineComponent` type bakes the build-time Vue patch release's
// private generic arity into our tarball and breaks other supported Vue patches.
export { Box } from "./components/public-box.ts";
export type { AriaRole, AriaState, BoxProps } from "./components/box-props.ts";
export type { Color } from "./components/color.ts";
export const Text = TextSfc as unknown as PublicComponent<TextProps>;
export type { TextProps } from "./components/text-props.ts";

export { useApp, type UseAppReturn } from "./composables/useApp.ts";
export { useInput } from "./composables/useInput.ts";
export type { TuiInputEvent, TuiKeyName } from "./io/public-input.ts";
export { useStdin, type UseStdinReturn } from "./composables/useStdin.ts";
export { useLayoutWidth } from "./composables/use-layout-width.ts";
export { useViewportHeight } from "./composables/use-viewport-height.ts";
export { useBoxSize, type BoxSize } from "./composables/use-box-size.ts";
export { useBoxPresence } from "./composables/use-box-presence.ts";
export type { RenderMode, RenderPresentation } from "./render-session.ts";
// `measureText` / `measureTextNatural` are deliberately NOT re-exported: Ink keeps
// its `measure-text` module internal, and so do we. They remain internal helpers
// (yoga.ts uses `measureTextNatural`). See .agents/docs/ink-divergences.md.
// `renderScreenReaderOutput` / `ScreenReaderOptions` are likewise private: the
// linearizer accepts Runtime host nodes and is not a standalone user operation.
