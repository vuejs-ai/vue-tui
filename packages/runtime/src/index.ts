export { createApp, type TuiApp, type MountOptions } from "./render.ts";
export { renderToString, type RenderToStringOptions } from "./render-to-string.ts";

export {
  Box,
  type AriaRole,
  type AriaState,
  type BoxStyle,
  type BoxProps,
} from "./components/box.ts";
export { Text, type TextProps } from "./components/text.ts";
export { Newline, type NewlineProps } from "./components/newline.ts";
export { Spacer } from "./components/spacer.ts";
export { Static, type StaticProps } from "./components/static.ts";
export { Transform, type TransformProps } from "./components/transform.ts";

export { useApp, type UseAppReturn } from "./composables/useApp.ts";
export { useInput, type Key, type UseInputOptions } from "./composables/useInput.ts";
export { usePaste, type UsePasteOptions } from "./composables/usePaste.ts";
export { useFocus, type UseFocusOptions } from "./composables/useFocus.ts";
export { useFocusManager } from "./composables/useFocusManager.ts";
export { useStdin, type UseStdinReturn } from "./composables/useStdin.ts";
export { useStdout, type UseStdoutReturn } from "./composables/useStdout.ts";
export { useStderr, type UseStderrReturn } from "./composables/useStderr.ts";
export { useWindowSize, type WindowSize } from "./composables/useWindowSize.ts";
export { useCursor, type CursorPosition } from "./composables/useCursor.ts";
export { useIsScreenReaderEnabled } from "./composables/useIsScreenReaderEnabled.ts";
export {
  useAnimation,
  type UseAnimationOptions,
  type UseAnimationReturn,
} from "./composables/useAnimation.ts";
export {
  useBoxMetrics,
  measureElement,
  type BoxMetrics,
  type UseBoxMetricsReturn,
} from "./composables/useBoxMetrics.ts";
export { renderScreenReaderOutput, type ScreenReaderOptions } from "./paint/screen-reader.ts";
export {
  kittyFlags,
  kittyModifiers,
  type KittyKeyboardOptions,
  type KittyFlagName,
} from "./io/kitty-keyboard.ts";
// `measureText` / `measureTextNatural` are deliberately NOT re-exported: Ink keeps
// its `measure-text` module internal, and so do we. They remain internal helpers
// (yoga.ts uses `measureTextNatural`). See .agents/docs/ink-divergences.md.
