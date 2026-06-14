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
export type { AppContext } from "./context.ts";
export {
  createKittyKeyboardController,
  matchKittyQueryResponse,
  hasCompleteKittyQueryResponse,
  stripKittyQueryResponsesAndTrailingPartial,
  resolveFlags,
  type KittyKeyboardController,
} from "./io/kitty-keyboard.ts";
export { INTERNAL_FRAME_SINK, type FrameSink } from "./io/frame-sink.ts";
// Exposed for unit testing: error-overview.ts imports .vue SFCs, which the
// runtime-tests vitest config does not compile (no @vitejs/plugin-vue), so a
// pure-function test of this helper must reach it through the built dist.
export { messageForNonError } from "./components/error-overview.ts";
