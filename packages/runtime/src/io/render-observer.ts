import type { DeepReadonly } from "vue";
import type { InternalLiveRenderSessionSnapshot } from "../render-session.ts";

/** One renderer content commit before output-writer transformation. */
export interface InternalContentFrame {
  /**
   * Current dynamic region. Renderer-emitted SGR styling is retained; output-
   * writer lifecycle and screen-update controls are excluded.
   */
  readonly dynamic: string;
  /**
   * New `<Static>` content produced by this commit, without accumulated replay.
   * Renderer-emitted SGR styling is retained; output-writer controls are excluded.
   */
  readonly staticOutput: string;
  /** Whether the renderer committed during the mounted lifetime or teardown. */
  readonly phase: "update" | "teardown";
}

/**
 * Internal deterministic-render observer. When its callbacks return normally,
 * installing it does not select a diagnostic output path, change scheduling,
 * or manufacture terminal capabilities. Callback errors deliberately propagate
 * so broken test instrumentation cannot turn into a passing assertion.
 */
export interface InternalRenderObserver {
  onSession?(session: DeepReadonly<InternalLiveRenderSessionSnapshot>): void;
  onCommit?(frame: InternalContentFrame): void;
}

export const INTERNAL_RENDER_OBSERVER: unique symbol = Symbol("vue-tui.internal.renderObserver");
