// Repository-only barrel. It is built for the workspace's own tests and is not
// listed in package.json "exports", so it never ships as a resolvable entry.
// Re-export only what a real in-repository consumer imports: renderer node
// types, protocol controllers, and internal session snapshots stay private, so
// nothing here should grow back just because a symbol exists.
export { attachYoga } from "../layout/yoga.ts";
export { createRoot, createBox, createText, type TuiNode } from "../host/nodes.ts";
export type { DevState, DevErrorInfo } from "../dev/hmr.ts";
export {
  connectDevtools,
  disconnectDevtools,
  isDevConnected,
  getDevtoolsSessionId,
} from "../dev/hmr.ts";
export type { AppContext } from "../vue/context.ts";
export {
  createInternalMountOptions,
  type InternalMountOptions,
  type InternalMountOptionsInput,
} from "./internal-mount-options.ts";
export { INTERNAL_KITTY_KEYBOARD, type KittyKeyboardOptions } from "../terminal/kitty-keyboard.ts";
export { INTERNAL_RENDER_OBSERVER, type InternalRenderObserver } from "../session/session.ts";
export { INTERNAL_TERMINAL_SIZE_PROBE } from "../terminal/node/terminal-size-probe.ts";
export { useInternalRenderSession } from "../session/render-session.ts";
export {
  INTERNAL_SUSPENSION_HOST,
  createManualSuspensionHost,
  type SuspensionHost,
} from "../terminal/node/process-suspension.ts";
// Exposed for focused non-Error normalization tests used by Runtime-owned
// failures and the synchronous string renderer.
export { messageForNonError } from "../vue/error-value.ts";
export { useStdout, type UseStdoutReturn } from "../vue/composables/useStdout.ts";
export { useStderr, type UseStderrReturn } from "../vue/composables/useStderr.ts";
export type { CoordinatedWriteResult } from "../vue/context.ts";
export { shouldSynchronize } from "../terminal/write-synchronized.ts";
export { bsu, esu } from "../terminal/mode-leases.ts";
export { nextLineEscape } from "../surface/line-helpers.ts";
export { MAX_LAYOUT_VALUE } from "../layout/numeric-limits.ts";
