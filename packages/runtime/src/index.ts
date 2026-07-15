import BoxSfc from "./components/box.vue";
import TextSfc from "./components/text.vue";
import SpacerSfc from "./components/spacer.vue";
import NewlineSfc from "./components/newline.vue";
import type { PublicComponent, PublicLeafComponent } from "./components/with-children.ts";
import type { BoxProps } from "./components/box-props.ts";
import type { TextProps } from "./components/text-props.ts";
import type { SpacerProps } from "./components/spacer-props.ts";
import type { NewlineProps } from "./components/newline-props.ts";

export { createApp, type TuiApp, type MountOptions } from "./render.ts";
export { renderToString, type RenderToStringOptions } from "./render-to-string.ts";
export { useClipboard, type UseClipboardReturn } from "./composables/useClipboard.ts";
export type {
  ClipboardAvailability,
  ClipboardTransport,
  ClipboardTransportResult,
  ClipboardUnavailableReason,
  ClipboardWriteResult,
  CustomClipboardTransport,
  Osc52ClipboardTransport,
} from "./clipboard/clipboard-service.ts";

// Publish only the stable author-facing constructor shape. Exposing the SFC's
// generated `DefineComponent` type bakes the build-time Vue patch release's
// private generic arity into our tarball and breaks other supported Vue patches.
export const Box = BoxSfc as unknown as PublicComponent<BoxProps>;
export type {
  AriaRole,
  AriaState,
  BoxLayoutStyle,
  BoxStyle,
  BoxProps,
} from "./components/box-props.ts";
export const Text = TextSfc as unknown as PublicComponent<TextProps>;
export type { TextProps } from "./components/text-props.ts";
export const Newline = NewlineSfc as unknown as PublicLeafComponent<NewlineProps>;
export type { NewlineProps } from "./components/newline-props.ts";
// Spacer takes no props and no children; the `children?: never` cast makes
// `<Spacer>x</Spacer>` a type error under the automatic JSX runtime (parity with
// main's spacer.ts typing). `as unknown as` (like Static) REPLACES the SFC type:
// the empty `.vue`'s DefineComponent carries an `any` that would make a `typeof
// SpacerSfc & {…}` intersection redundant (lint: no-redundant-type-constituents).
export const Spacer = SpacerSfc as unknown as {
  new (): { $props: SpacerProps & { children?: never } };
};
export type { SpacerProps } from "./components/spacer-props.ts";
export { Transform, type TransformProps } from "./components/transform.ts";

export { useApp, type UseAppReturn } from "./composables/useApp.ts";
export { useInput, type UseInputOptions } from "./composables/useInput.ts";
export {
  type InputHandler,
  type InputHandlerResult,
  type InputRouteDecision,
  type TuiInputEvent,
  type TuiInputModifiers,
  type TuiInputPhase,
  type TuiInputSource,
} from "./io/public-input.ts";
export {
  useInputAvailability,
  type UseInputAvailabilityReturn,
} from "./composables/useInputAvailability.ts";
export type { InputAvailability } from "./io/input-availability.ts";
export { useFocus, type UseFocusOptions, type UseFocusReturn } from "./composables/useFocus.ts";
export {
  useFocusScope,
  type UseFocusScopeOptions,
  type UseFocusScopeReturn,
} from "./composables/useFocusScope.ts";
export { useFocusedInput } from "./composables/useFocusedInput.ts";
export { useFocusScopeInput } from "./composables/useFocusScopeInput.ts";
export {
  useExternalInput,
  type ExternalInputHandler,
  type ExternalInputSource,
} from "./composables/useExternalInput.ts";
export { useFocusManager, type UseFocusManagerReturn } from "./composables/useFocusManager.ts";
export { useStdin, type UseStdinReturn } from "./composables/useStdin.ts";
export { useStdout, type UseStdoutReturn } from "./composables/useStdout.ts";
export { useStderr, type UseStderrReturn } from "./composables/useStderr.ts";
export type { CoordinatedWriteResult } from "./io/output-coordinator.ts";
export { useLayoutSize, type UseLayoutSizeReturn } from "./composables/useLayoutSize.ts";
export { useRenderSession } from "./composables/useRenderSession.ts";
export type {
  RenderLayoutSize,
  RenderMode,
  RenderModeResolution,
  RenderOutput,
  RenderSession,
  RenderSize,
} from "./render-session.ts";
export {
  useCaret,
  type CaretState,
  type UseCaretOptions,
  type UseCaretReturn,
} from "./composables/useCaret.ts";
export {
  useAnimation,
  type UseAnimationOptions,
  type UseAnimationReturn,
} from "./composables/useAnimation.ts";
export {
  useElementGeometry,
  type CellPoint,
  type CellRect,
  type ElementGeometry,
  type ElementGeometryFragment,
  type ElementTarget,
  type UseElementGeometryReturn,
} from "./composables/useElementGeometry.ts";
export {
  kittyFlags,
  kittyModifiers,
  type KittyKeyboardOptions,
  type KittyFlagName,
} from "./io/kitty-keyboard.ts";
// `measureText` / `measureTextNatural` are deliberately NOT re-exported: Ink keeps
// its `measure-text` module internal, and so do we. They remain internal helpers
// (yoga.ts uses `measureTextNatural`). See .agents/docs/ink-divergences.md.
// `renderScreenReaderOutput` / `ScreenReaderOptions` are likewise NOT public: Ink keeps
// its SR linearizer (`renderNodeToScreenReaderOutput`) module-internal, and it was never
// usefully callable from here (its `TuiNode` argument type isn't public). It lives in
// `@vue-tui/runtime/internal`. See .agents/docs/accessibility-api.md.
