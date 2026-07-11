export { yogaNodeTracker, attachYoga } from "./host/yoga.ts";
export {
  createRoot,
  createBox,
  createText,
  createTextLeaf,
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
export {
  createKittyKeyboardController,
  matchKittyQueryResponse,
  hasCompleteKittyQueryResponse,
  stripKittyQueryResponsesAndTrailingPartial,
  resolveFlags,
  type KittyKeyboardController,
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
// Exposed for unit testing: error-overview.ts imports .vue SFCs, which the
// runtime-tests vitest config does not compile (no @vitejs/plugin-vue), so a
// pure-function test of this helper must reach it through the built dist.
export { messageForNonError } from "./components/error-overview.ts";
// Exposed for unit testing the focus-subscriber leak fix: the returned controller
// carries a `__subscriberMapSize()` probe so a test can assert empty subscriber
// Sets are dropped on unsubscribe. See render.ts createFocusController.
export { createFocusController, type FocusControllerForTest } from "./render.ts";
