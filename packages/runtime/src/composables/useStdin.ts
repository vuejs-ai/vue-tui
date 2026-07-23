import type { Readable } from "node:stream";
import { inject, onScopeDispose } from "vue";
import { StdinContextKey } from "../context.ts";

/** The raw stdin escape hatch returned by {@link useStdin}. */
export interface UseStdinReturn {
  /**
   * The actual stdin stream selected for the current mount. Bytes read from this raw
   * escape hatch have no vue-tui event semantics and are not guaranteed to compose
   * safely with framework-managed input routing.
   */
  readonly stdin: Readable;
  /**
   * Whether Runtime can coordinate raw mode for the mounted stream. A raw-mode
   * operation can still fail when the host itself rejects the transition.
   */
  readonly isRawModeSupported: boolean;
  /**
   * Acquire or release this hook call's own idempotent logical raw-mode hold.
   * Vue scope disposal releases a surviving hold automatically.
   */
  readonly setRawMode: (enabled: boolean) => void;
}

export function useStdin(): UseStdinReturn {
  const ctx = inject(StdinContextKey);
  if (!ctx) throw new Error("useStdin() must be called inside a vue-tui render tree");
  let releaseRawMode: (() => void) | undefined;
  let rawModeRequested = false;
  let acquiringRawMode = false;
  let scopeActive = true;

  const reconcileRawMode = (): void => {
    if (!scopeActive || !rawModeRequested) {
      const release = releaseRawMode;
      releaseRawMode = undefined;
      release?.();
      return;
    }
    if (releaseRawMode || acquiringRawMode) return;

    acquiringRawMode = true;
    let acquired: (() => void) | undefined;
    try {
      acquired = ctx.acquirePublicRawMode();
    } finally {
      acquiringRawMode = false;
    }

    // A host raw-mode callback may synchronously re-enter this hook or dispose
    // its Vue scope before acquisition returns. Honor the final requested state
    // instead of publishing an unreachable second token.
    if (!scopeActive || !rawModeRequested) {
      acquired();
      return;
    }
    releaseRawMode = acquired;
  };

  const setRawMode = (enabled: boolean): void => {
    if (!scopeActive) return;
    rawModeRequested = enabled;
    reconcileRawMode();
  };

  onScopeDispose(() => {
    scopeActive = false;
    rawModeRequested = false;
    reconcileRawMode();
  });

  // Do not return the internal context under a narrower TypeScript annotation.
  // JavaScript consumers can inspect object fields, and the framework's raw-mode,
  // protocol, and routing operations are intentionally not public escape hatches.
  return Object.freeze({
    stdin: ctx.stdin,
    isRawModeSupported: ctx.isRawModeSupported,
    setRawMode,
  });
}
