export { yogaNodeTracker, attachYoga } from "./host/yoga.ts";
export {
  runtimeResourceKinds,
  runtimeResourceTracker,
  type RuntimeResourceKind,
  type RuntimeResourceSnapshot,
} from "./resource-tracker.ts";
export {
  createRoot,
  createBox,
  createText,
  createTextLeaf,
  observeTuiNodeCreations,
  type TuiRoot,
  type TuiBox,
  type TuiText,
  type TuiNode,
} from "./host/nodes.ts";
export { renderScreenReaderOutput, type ScreenReaderOptions } from "./paint/screen-reader.ts";
export { renderToStringWithScreenReader } from "./render-to-string.ts";
export type { DevState, DevErrorInfo } from "./hmr.ts";
export { connectDevtools, isDevConnected } from "./hmr.ts";
export type { AppContext } from "./context.ts";
export type { InternalMountOptions } from "./render.ts";
export {
  INTERNAL_KITTY_KEYBOARD,
  createKittyKeyboardController,
  matchKittyQueryResponse,
  hasCompleteKittyQueryResponse,
  stripKittyQueryResponsesAndTrailingPartial,
  resolveFlags,
  type InternalKittyKeyboardMountOptions,
  type KittyKeyboardOptions,
  type KittyKeyboardController,
  type StartKittyQueryResponseDetection,
} from "./io/kitty-keyboard.ts";
export {
  INTERNAL_RENDER_OBSERVER,
  type InternalContentFrame,
  type InternalRenderObserver,
} from "./io/render-observer.ts";
export {
  INTERNAL_TERMINAL_SIZE_PROBE,
  type TerminalSizeProbe,
  type TerminalSizeProbeResult,
} from "./terminal-size-probe.ts";
export {
  useInternalRenderSession,
  type InternalRenderSessionSnapshot,
  type InternalLiveRenderSessionSnapshot,
  type InternalStringRenderSessionSnapshot,
} from "./render-session.ts";
export {
  INTERNAL_SUSPENSION_HOST,
  createManualSuspensionHost,
  type ManualSuspensionHost,
  type SuspensionHost,
} from "./process-suspension.ts";
export {
  INTERNAL_TEST_INPUT_HOST,
  type InternalTestInputHost,
  type InternalTestMouseEvent,
  type InternalTestMouseModifiers,
} from "./io/test-input-host.ts";
// Exposed for unit testing: error-overview.ts imports .vue SFCs, which the
// runtime-tests vitest config does not compile (no @vitejs/plugin-vue), so a
// pure-function test of this helper must reach it through the built dist.
export { messageForNonError } from "./error-value.ts";
export { useStdout, type UseStdoutReturn } from "./composables/useStdout.ts";
export { useStderr, type UseStderrReturn } from "./composables/useStderr.ts";
export type { CoordinatedWriteResult } from "./io/output-coordinator.ts";
export { bsu, esu, shouldSynchronize } from "./io/write-synchronized.ts";
export { nextLineEscape } from "./io/cursor-helpers.ts";
export { MAX_LAYOUT_VALUE } from "./numeric-limits.ts";
// Private integration-test access for exercising F3's selected topology and
// external fallthrough through a real outer terminal and a real child PTY.
// Ordinary applications compose public focus targets, scopes, and external
// receivers instead; fixtures must not mix this selector with F4 ownership.
export { useInternalInputRoutingForTest } from "./io/input-route-test.ts";
