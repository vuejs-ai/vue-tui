import { queuePostFlushCb } from "vue";

export interface CommitScheduler {
  schedule: () => void;
  flush: () => Promise<void>;
  now: () => number;
  /** Returns true when a trailing-edge commit is pending. */
  hasPending: () => boolean;
  /** Cancel any pending trailing-edge timer. */
  cancel: () => void;
}

export interface CommitSchedulerOptions {
  /** Disable time-based throttle (used in tests / debug mode). */
  immediate?: boolean;
  /**
   * Throttle window in ms — the leading+trailing commit interval. The caller
   * derives it from `maxFps` (`ceil(1000/maxFps)`, i.e. 34ms at the default
   * maxFps=30, matching Ink). Unused when `immediate` is set (commits fire
   * every tick); pass 0 there.
   */
  throttleMs: number;
  now?: () => number;
}

export function createCommitScheduler(
  commit: () => void,
  options: CommitSchedulerOptions,
): CommitScheduler {
  const immediate = options.immediate ?? false;
  const throttleMs = options.throttleMs;
  const now = options.now ?? Date.now;
  let scheduled = false;
  // Multiple concurrent flush() callers can be waiting on the same pending
  // commit; settle all of them rather than overwriting a single resolver.
  let flushResolvers: (() => void)[] = [];

  function drainFlushResolvers() {
    if (flushResolvers.length === 0) return;
    const resolvers = flushResolvers;
    flushResolvers = [];
    for (const resolve of resolvers) resolve();
  }

  // Throttle state (production only). This mirrors the OBSERVABLE timing of
  // Ink's render throttle — es-toolkit/compat `throttle(fn, wait, {leading,
  // trailing})`, i.e. `debounce(fn, wait, {leading, trailing, maxWait: wait})`
  // — not its implementation (verified against real Ink v7.0.4, audit e29):
  //   - leading: a call with no active trailing window commits synchronously
  //     and arms the window;
  //   - trailing: EVERY deferred call re-arms the window, so the trailing
  //     commit fires at lastCall+wait (NOT windowStart+wait);
  //   - maxWait: when a call arrives a full window after the first deferral
  //     (`pendingAt`), it commits synchronously — sustained updates hold a
  //     ~wait cadence instead of debounce-starving forever.
  let trailingTimer: ReturnType<typeof setTimeout> | null = null;
  let hasPendingFlag = false;
  // Time of the first call since the last leading/trailing commit
  // (es-toolkit compat-debounce `pendingAt`); drives the maxWait edge.
  let pendingAt: number | null = null;

  function doCommit() {
    scheduled = false;
    hasPendingFlag = false;
    pendingAt = null;
    try {
      commit();
    } finally {
      drainFlushResolvers();
    }
  }

  // (Re-)arm the trailing window at now+wait. Like es-toolkit's debounce
  // `schedule()`, the timer is armed even when nothing is deferred yet (after
  // a leading/maxWait commit): an "empty" expiry is a no-op, but while armed
  // it marks the window as active so calls inside it defer.
  function armTrailingWindow() {
    if (trailingTimer) clearTimeout(trailingTimer);
    trailingTimer = setTimeout(() => {
      trailingTimer = null;
      if (hasPendingFlag) doCommit();
    }, throttleMs);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queuePostFlushCb(() => {
      // cancel() (teardown) may run between scheduling and this callback
      // firing. The callback is a captured closure, so cancel() can't unqueue
      // it — bail here so it doesn't commit on a torn-down tree or re-arm a
      // trailing timer that nothing will cancel.
      if (!scheduled) return;
      // Reset eagerly (not only in doCommit): a deferred call must leave
      // `scheduled` false so the NEXT call re-enters this callback and
      // re-arms the trailing window — `lastCall+wait` only works if every
      // call reaches the throttle, as every Ink `onRender` call does.
      scheduled = false;
      if (immediate) {
        doCommit();
        return;
      }
      const currentTime = now();
      if (pendingAt === null) pendingAt = currentTime;
      if (currentTime - pendingAt >= throttleMs) {
        // maxWait edge: deferred calls have been pushing the trailing edge
        // for a full window — commit now, then re-arm an (empty) window so
        // the next call defers instead of double-committing as leading.
        // pendingAt is stamped AFTER the commit (es-toolkit does the same),
        // so paint time doesn't eat into the next window.
        doCommit();
        pendingAt = now();
        armTrailingWindow();
        return;
      }
      const isWindowActive = trailingTimer !== null;
      // Ink parity (audit e29): every call re-anchors the trailing edge to
      // now+wait, exactly like es-toolkit's debounce re-arming per call.
      armTrailingWindow();
      if (isWindowActive) {
        // Inside an active window: defer to the trailing edge.
        hasPendingFlag = true;
      } else {
        // Leading edge: no active window — commit synchronously.
        doCommit();
      }
    });
  }

  function flush(): Promise<void> {
    if (!scheduled && !hasPendingFlag) return Promise.resolve();
    return new Promise<void>((resolve) => {
      flushResolvers.push(resolve);
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
    // Clean slate: the next schedule() after a cancel commits on the leading
    // edge (no live window, no deferral history).
    pendingAt = null;
    // Resolve any waiters blocked on flush() — the pending commit will never
    // fire now, so leaving them unsettled would hang waitUntilRenderFlush.
    drainFlushResolvers();
  }

  return { schedule, flush, now, hasPending, cancel };
}
