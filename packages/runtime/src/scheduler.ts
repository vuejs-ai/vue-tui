import { queuePostFlushCb } from "@vue/runtime-core";

export interface CommitScheduler {
  schedule: () => void;
  flush: () => Promise<void>;
}

export interface CommitSchedulerOptions {
  /** Disable time-based throttle (used in tests / debug mode). */
  immediate?: boolean;
}

/** Minimum interval between commits in production (~30fps). */
const THROTTLE_MS = 32;

export function createCommitScheduler(
  commit: () => void,
  options: CommitSchedulerOptions = {},
): CommitScheduler {
  const immediate = options.immediate ?? false;
  let scheduled = false;
  let resolveFlush: (() => void) | null = null;

  // Throttle state (production only): leading+trailing pattern.
  // The leading call fires immediately, subsequent calls within the window
  // are collapsed into a single trailing call at the end of the window.
  let lastCommitTime = 0;
  let trailingTimer: ReturnType<typeof setTimeout> | null = null;
  let hasPending = false;

  function doCommit() {
    scheduled = false;
    hasPending = false;
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
      if (elapsed >= THROTTLE_MS) {
        // Leading edge: fire immediately
        if (trailingTimer) {
          clearTimeout(trailingTimer);
          trailingTimer = null;
        }
        doCommit();
      } else {
        // Within throttle window: schedule trailing edge
        hasPending = true;
        if (!trailingTimer) {
          trailingTimer = setTimeout(() => {
            trailingTimer = null;
            if (hasPending) doCommit();
          }, THROTTLE_MS - elapsed);
        }
      }
    });
  }

  function flush(): Promise<void> {
    if (!scheduled && !hasPending) return Promise.resolve();
    return new Promise<void>((resolve) => {
      resolveFlush = resolve;
    });
  }

  return { schedule, flush };
}
