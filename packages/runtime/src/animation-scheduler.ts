const DEFAULT_INTERVAL = 100;
const MAX_TIMER_INTERVAL = 2_147_483_647;

export function normalizeInterval(interval: number | undefined): number {
  if (interval === undefined || !Number.isFinite(interval)) return DEFAULT_INTERVAL;
  // No rounding — Ink's normalizeAnimationInterval (use-animation.ts:147-151) preserves
  // fractional intervals (e.g. 16.67ms for 60fps); rounding would drift frame counts and
  // the scheduler's nextDueTime over time. The scheduler already ceil()s the setTimeout delay.
  return Math.min(Math.max(1, interval), MAX_TIMER_INTERVAL);
}

type AnimationSubscriber = {
  callback: (currentTime: number) => void;
  interval: number;
  startTime: number;
  nextDueTime: number;
  cancelled: boolean;
};

export interface AnimationScheduler {
  /**
   * Render-throttle window in ms, derived from `maxFps`. useAnimation coalesces
   * ticks while inside the current window so committed deltas accumulate across
   * skipped ticks (Ink parity — see AnimationContext.renderThrottleMs). `0`
   * disables throttling (debug / screen-reader / standalone fallback).
   */
  readonly renderThrottleMs: number;
  subscribe(
    callback: (currentTime: number) => void,
    interval: number,
  ): { startTime: number; unsubscribe: () => void };
  dispose(): void;
}

export function createAnimationScheduler(renderThrottleMs = 0): AnimationScheduler {
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
    // Round up: setTimeout truncates fractional delays, which would fire the
    // timer before `earliest`. onTick then skips (now < nextDueTime) and
    // reschedules a ~0ms delay, busy-looping until the clock catches up.
    const delay = Math.ceil(Math.max(0, earliest - performance.now()));
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

  return { renderThrottleMs, subscribe, dispose };
}

export function createNoOpAnimationScheduler(): AnimationScheduler {
  return {
    renderThrottleMs: 0,
    subscribe() {
      return { startTime: 0, unsubscribe() {} };
    },
    dispose() {},
  };
}
