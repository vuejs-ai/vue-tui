export { createApp, type TuiApp, type MountOptions } from "./render.ts";
export { renderToString, type RenderToStringOptions } from "./render-to-string.ts";

export {
  Box,
  type AriaRole,
  type AriaState,
  type BoxStyle,
  type BoxProps,
} from "./components/Box.ts";
export { Text, type TextProps } from "./components/Text.ts";
export { Newline, type NewlineProps } from "./components/Newline.ts";
export { Spacer } from "./components/Spacer.ts";
export { Static, type StaticProps } from "./components/Static.ts";
export { Transform, type TransformProps } from "./components/Transform.ts";

export { useApp } from "./composables/useApp.ts";
export { useInput, type Key, type UseInputOptions } from "./composables/useInput.ts";
export { usePaste, type UsePasteOptions } from "./composables/usePaste.ts";
export { useFocus, type UseFocusOptions } from "./composables/useFocus.ts";
export { useFocusManager } from "./composables/useFocusManager.ts";
export { useStdin } from "./composables/useStdin.ts";
export { useStdout } from "./composables/useStdout.ts";
export { useStderr } from "./composables/useStderr.ts";
export { useTerminalSize, useWindowSize, type WindowSize } from "./composables/useTerminalSize.ts";
export { useCursor, type CursorPosition } from "./composables/useCursor.ts";
export { useIsScreenReaderEnabled } from "./composables/useIsScreenReaderEnabled.ts";
export {
  useAnimation,
  type AnimationOptions,
  type AnimationResult,
} from "./composables/useAnimation.ts";
export {
  useBoxMetrics,
  measureElement,
  type BoxMetrics,
  type UseBoxMetricsResult,
} from "./composables/useBoxMetrics.ts";
export { renderScreenReaderOutput, type ScreenReaderOptions } from "./paint/screen-reader.ts";
export type { DevState, DevErrorInfo } from "./hmr.ts";
export {
  kittyFlags,
  kittyModifiers,
  type KittyKeyboardOptions,
  type KittyFlagName,
} from "./io/kitty-keyboard.ts";
// `measureText` / `measureTextNatural` are deliberately NOT re-exported: Ink keeps
// its `measure-text` module internal, and so do we. They remain internal helpers
// (yoga.ts uses `measureTextNatural`). See .agents/docs/ink-divergences.md.
