import { queuePostFlushCb } from "@vue/runtime-core";

export interface CommitScheduler {
  schedule: () => void;
  flush: () => Promise<void>;
  /** Returns true when a trailing-edge commit is pending. */
  hasPending: () => boolean;
  /** Cancel any pending trailing-edge timer. */
  cancel: () => void;
}

export interface CommitSchedulerOptions {
  /** Disable time-based throttle (used in tests / debug mode). */
  immediate?: boolean;
  /** Override throttle interval in ms. Takes precedence over the default 32ms. */
  throttleMs?: number;
}

/** Default minimum interval between commits (~30fps). */
const DEFAULT_THROTTLE_MS = 32;

export function createCommitScheduler(
  commit: () => void,
  options: CommitSchedulerOptions = {},
): CommitScheduler {
  const immediate = options.immediate ?? false;
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  let scheduled = false;
  let resolveFlush: (() => void) | null = null;

  // Throttle state (production only): leading+trailing pattern.
  // The leading call fires immediately, subsequent calls within the window
  // are collapsed into a single trailing call at the end of the window.
  let lastCommitTime = 0;
  let trailingTimer: ReturnType<typeof setTimeout> | null = null;
  let hasPendingFlag = false;

  function doCommit() {
    scheduled = false;
    hasPendingFlag = false;
    lastCommitTime = Date.now();
    try {
      commit();
    } finally {
      const r = resolveFlush;
      resolveFlush = null;
      r?.();
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queuePostFlushCb(() => {
      if (immediate) {
        doCommit();
        return;
      }
      // Leading+trailing throttle: fire immediately if enough time has
      // passed since last commit (leading edge). Otherwise mark pending
      // and let the trailing timer handle it.
      const elapsed = Date.now() - lastCommitTime;
      if (elapsed >= throttleMs) {
        // Leading edge: fire immediately
        if (trailingTimer) {
          clearTimeout(trailingTimer);
          trailingTimer = null;
        }
        doCommit();
      } else {
        // Within throttle window: schedule trailing edge
        hasPendingFlag = true;
        if (!trailingTimer) {
          trailingTimer = setTimeout(() => {
            trailingTimer = null;
            if (hasPendingFlag) doCommit();
          }, throttleMs - elapsed);
        }
      }
    });
  }

  function flush(): Promise<void> {
    if (!scheduled && !hasPendingFlag) return Promise.resolve();
    return new Promise<void>((resolve) => {
      resolveFlush = resolve;
    });
  }

  function hasPending(): boolean {
    return hasPendingFlag;
  }

  function cancel() {
    if (trailingTimer) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }
    hasPendingFlag = false;
    scheduled = false;
    // Resolve any waiter blocked on flush() — the pending commit will never
    // fire now, so leaving resolveFlush unsettled would hang waitUntilRenderFlush.
    const r = resolveFlush;
    resolveFlush = null;
    r?.();
  }

  return { schedule, flush, hasPending, cancel };
}
