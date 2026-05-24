import { queuePostFlushCb } from "@vue/runtime-core";

export interface CommitScheduler {
  schedule: () => void;
  flush: () => Promise<void>;
}

export function createCommitScheduler(commit: () => void): CommitScheduler {
  let scheduled = false;
  let resolveFlush: (() => void) | null = null;

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queuePostFlushCb(() => {
      scheduled = false;
      try {
        commit();
      } finally {
        const r = resolveFlush;
        resolveFlush = null;
        r?.();
      }
    });
  }

  function flush(): Promise<void> {
    if (!scheduled) return Promise.resolve();
    return new Promise<void>((resolve) => {
      resolveFlush = resolve;
    });
  }

  return { schedule, flush };
}
