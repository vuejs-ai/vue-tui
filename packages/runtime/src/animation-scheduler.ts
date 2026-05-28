const DEFAULT_INTERVAL = 100;
const MAX_TIMER_INTERVAL = 2_147_483_647;

export function normalizeInterval(interval: number | undefined): number {
  if (interval === undefined || !Number.isFinite(interval)) return DEFAULT_INTERVAL;
  return Math.min(Math.max(1, Math.round(interval)), MAX_TIMER_INTERVAL);
}

type AnimationSubscriber = {
  callback: (currentTime: number) => void;
  interval: number;
  startTime: number;
  nextDueTime: number;
  cancelled: boolean;
};

export interface AnimationScheduler {
  subscribe(
    callback: (currentTime: number) => void,
    interval: number,
  ): { startTime: number; unsubscribe: () => void };
  dispose(): void;
}

export function createAnimationScheduler(): AnimationScheduler {
  const subscribers = new Set<AnimationSubscriber>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scheduledDueTime = Number.POSITIVE_INFINITY;
  let isDispatching = false;
  const pending: Array<() => void> = [];

  function clearTimer() {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    scheduledDueTime = Number.POSITIVE_INFINITY;
  }

  function schedule() {
    clearTimer();
    let earliest = Number.POSITIVE_INFINITY;
    for (const s of subscribers) {
      if (!s.cancelled) earliest = Math.min(earliest, s.nextDueTime);
    }
    if (earliest === Number.POSITIVE_INFINITY) return;
    scheduledDueTime = earliest;
    const delay = Math.max(0, earliest - performance.now());
    timer = setTimeout(onTick, delay);
  }

  function onTick() {
    timer = undefined;
    scheduledDueTime = Number.POSITIVE_INFINITY;
    const now = performance.now();
    isDispatching = true;
    for (const s of subscribers) {
      if (s.cancelled || now < s.nextDueTime) continue;
      s.callback(now);
      if (s.cancelled) continue;
      const elapsedFrames = Math.floor((now - s.startTime) / s.interval) + 1;
      s.nextDueTime = s.startTime + elapsedFrames * s.interval;
    }
    isDispatching = false;
    if (pending.length > 0) {
      for (const op of pending.splice(0)) op();
    }
    schedule();
  }

  function subscribe(callback: (currentTime: number) => void, intervalRaw: number) {
    const interval = normalizeInterval(intervalRaw);
    const startTime = performance.now();
    const sub: AnimationSubscriber = {
      callback,
      interval,
      startTime,
      nextDueTime: startTime + interval,
      cancelled: false,
    };

    const add = () => {
      subscribers.add(sub);
      if (timer === undefined || sub.nextDueTime < scheduledDueTime) schedule();
    };
    if (isDispatching) pending.push(add);
    else add();

    return {
      startTime,
      unsubscribe() {
        sub.cancelled = true;
        const remove = () => {
          subscribers.delete(sub);
          if (subscribers.size === 0) clearTimer();
          else schedule();
        };
        if (isDispatching) pending.push(remove);
        else remove();
      },
    };
  }

  function dispose() {
    clearTimer();
    subscribers.clear();
    pending.length = 0;
  }

  return { subscribe, dispose };
}

export function createNoOpAnimationScheduler(): AnimationScheduler {
  return {
    subscribe() {
      return { startTime: 0, unsubscribe() {} };
    },
    dispose() {},
  };
}
