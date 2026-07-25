// Repository-only barrel. It is built for the workspace's own tests and is not
// listed in package.json "exports", so it never ships as a resolvable entry.
// Re-export only what a real in-repository consumer imports: renderer node
// types, protocol controllers, and internal session snapshots stay private, so
// nothing here should grow back just because a symbol exists.
export { attachYoga } from "./host/yoga.ts";
export { createRoot, createBox, createText, type TuiNode } from "./host/nodes.ts";
export type { DevState, DevErrorInfo } from "./hmr.ts";
export {
  connectDevtools,
  disconnectDevtools,
  isDevConnected,
  getDevtoolsSessionId,
} from "./hmr.ts";
export type { AppContext } from "./context.ts";
export {
  createInternalMountOptions,
  type InternalMountOptions,
  type InternalMountOptionsInput,
} from "./internal-mount-options.ts";
export { INTERNAL_KITTY_KEYBOARD, type KittyKeyboardOptions } from "./io/kitty-keyboard.ts";
export { INTERNAL_RENDER_OBSERVER, type InternalRenderObserver } from "./io/render-observer.ts";
export { INTERNAL_TERMINAL_SIZE_PROBE } from "./terminal-size-probe.ts";
export { useInternalRenderSession } from "./render-session.ts";
export {
  INTERNAL_SUSPENSION_HOST,
  createManualSuspensionHost,
  type SuspensionHost,
} from "./process-suspension.ts";
// Exposed for focused non-Error normalization tests used by Runtime-owned
// failures and the synchronous string renderer.
export { messageForNonError } from "./error-value.ts";
export { useStdout, type UseStdoutReturn } from "./composables/useStdout.ts";
export { useStderr, type UseStderrReturn } from "./composables/useStderr.ts";
export type { CoordinatedWriteResult } from "./io/output-coordinator.ts";
export { bsu, esu, shouldSynchronize } from "./io/write-synchronized.ts";
export { nextLineEscape } from "./io/cursor-helpers.ts";
export { MAX_LAYOUT_VALUE } from "./numeric-limits.ts";
