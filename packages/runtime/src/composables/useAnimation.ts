import {
  shallowRef,
  watch,
  toValue,
  inject,
  onScopeDispose,
  type MaybeRefOrGetter,
  type ShallowRef,
} from "vue";
import {
  createAnimationScheduler,
  normalizeInterval,
  type AnimationScheduler,
} from "../animation-scheduler.ts";
import { AnimationSchedulerKey } from "../context.ts";

export interface UseAnimationOptions {
  /**
   * Time between ticks in milliseconds.
   *
   * Reactive: pass a ref/getter to change the interval on a live animation.
   * While ACTIVE, changing it resets `frame`/`time`/`delta` to `0` and
   * re-subscribes at the new interval (Ink parity — `shouldReset` recomputes
   * `safeInterval` every render and resets when it differs while active).
   * While INACTIVE, the new value is recorded but nothing resets and no timer
   * starts; it takes effect on the next activation. A plain `number` keeps the
   * previous fixed behavior (the type is a strict superset).
   * @default 100
   */
  interval?: MaybeRefOrGetter<number>;

  /**
   * Whether the animation is running. When set to `false`, the animation stops.
   * When toggled back to `true`, all values reset to `0`.
   * @default true
   */
  isActive?: MaybeRefOrGetter<boolean>;
}

export interface UseAnimationReturn {
  /**
   * Discrete counter that increments by 1 each interval.
   * Useful for indexed sequences like spinner frames.
   */
  readonly frame: Readonly<ShallowRef<number>>;

  /**
   * Total elapsed time in milliseconds since the animation started or was last reset.
   * Useful for continuous math-based animations like sine waves.
   */
  readonly time: Readonly<ShallowRef<number>>;

  /**
   * Time in milliseconds since the previous tick.
   * Accounts for throttled renders. Useful for physics-based or velocity-driven motion.
   */
  readonly delta: Readonly<ShallowRef<number>>;

  /**
   * Resets `frame`, `time`, and `delta` to `0` and restarts timing from the
   * current moment. Useful for one-shot animations triggered by events.
   *
   * While the animation is INACTIVE (paused via `isActive`), `reset()` keeps the
   * last frame frozen instead of zeroing immediately; the zeroing is deferred to
   * the next resume (Ink parity — Ink's reset bumps a key consumed only by the
   * isActive-gated effect, so a paused reset zeros on resume, not before).
   */
  readonly reset: () => void;
}

/**
 * A composable that drives animations. Returns a frame counter, elapsed time,
 * frame delta, and a reset function.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useAnimation, Text } from '@vue-tui/runtime';
 *
 * const { frame } = useAnimation({ interval: 80 });
 * const characters = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
 * </script>
 * <template>
 *   <Text>{{ characters[frame % characters.length] }}</Text>
 * </template>
 * ```
 */
export function useAnimation(options: UseAnimationOptions = {}): UseAnimationReturn {
  const frame = shallowRef(0);
  const time = shallowRef(0);
  const delta = shallowRef(0);

  // Recomputed whenever the (reactive) interval changes — Ink re-reads
  // safeInterval every render. `tick`/`start` read this current value so a
  // re-subscribe after an interval change uses the new value.
  let interval = normalizeInterval(toValue(options.interval));
  // Fall back to a local standalone scheduler when used outside a vue-tui
  // render tree (graceful degradation, not a silent break).
  const scheduler: AnimationScheduler =
    inject(AnimationSchedulerKey, null) ?? createAnimationScheduler();

  const renderThrottleMs = scheduler.renderThrottleMs;

  let handle: { startTime: number; unsubscribe: () => void } | undefined;
  let startTime = 0;
  // Time of the last RENDERED (non-coalesced) tick — delta is measured from
  // here so it accumulates across ticks skipped within the throttle window.
  let lastRenderedTime = 0;
  // Ticks at or after this time are allowed to render; earlier ones coalesce.
  let nextRenderTime = 0;

  function tick(now: number) {
    // Coalesce intermediate ticks while inside the current render-throttle
    // window (Ink parity — use-animation.ts:102-121). The next allowed tick
    // jumps straight to the latest elapsed values, and delta reports the time
    // since the last rendered tick (accumulated across the skipped ticks) so
    // velocity-driven motion advances at correct wall-clock speed.
    if (renderThrottleMs > 0 && now < nextRenderTime) return;

    frame.value = Math.floor((now - startTime) / interval);
    time.value = now - startTime;
    delta.value = now - lastRenderedTime;
    lastRenderedTime = now;
    nextRenderTime = now + renderThrottleMs;
  }

  function start() {
    stop();
    frame.value = 0;
    time.value = 0;
    delta.value = 0;
    handle = scheduler.subscribe(tick, interval);
    startTime = handle.startTime;
    lastRenderedTime = handle.startTime;
    nextRenderTime = handle.startTime + renderThrottleMs;
  }

  function stop() {
    if (handle) {
      handle.unsubscribe();
      handle = undefined;
    }
  }

  function reset() {
    // Ink parity (use-animation.ts:83-89,138): reset() only bumps a resetKey;
    // the actual zeroing (setAnimState(zeroAnimState)) lives INSIDE the layout
    // effect, which early-returns while !isActive, and `shouldReset` is gated on
    // isActive. So:
    //  - ACTIVE: zero + restart timing now. start() already does both (the
    //    effect re-runs on resetKey while isActive in Ink).
    //  - INACTIVE (paused): do NOT zero — keep the last frame frozen. The next
    //    resume runs the isActive watch → start(), which zeros, so the reset
    //    lands on resume (Ink defers zeroing the same way).
    if (handle !== undefined) {
      start();
    }
  }

  // A SINGLE watcher on BOTH (isActive, interval), mirroring Ink's render-time
  // `shouldReset = isActive && (intervalChanged || becameActive)`
  // (use-animation.ts:77-96). Ink derives this once from the FINAL values of a
  // render, so a batch that both changes interval AND flips isActive→false
  // resolves to `shouldReset === false` and the frame FREEZES.
  //
  // Two `flush:"sync"` watchers cannot reproduce that: `sync` fires once PER
  // mutation, so `interval.value = 200; active.value = false` in one batch ran
  // the interval watcher first (while still active) → erroneous start() → frame
  // zeroed, before the isActive watcher could stop(). `flush:"post"` coalesces
  // the batch and fires once with the final values — verified to fire even in
  // the blessed standalone fallback (no mounted component drives the post-flush
  // queue, but a reactive mutation still flushes it). We always record the new
  // normalized `interval` so the next start() uses it.
  const isActive = options.isActive ?? true;
  // immediate handles the initial mount: a single start()/stop(), no double
  // subscribe (the old code split this across an immediate isActive watch + a
  // non-immediate interval watch for exactly that reason).
  watch(
    () => [toValue(isActive), normalizeInterval(toValue(options.interval))] as const,
    ([active, nextInterval], prev) => {
      const intervalChanged = prev !== undefined && nextInterval !== prev[1];
      const becameActive = prev === undefined || !prev[0];
      interval = nextInterval;
      if (!active) {
        // Paused (or starting inactive): stop and freeze. Nothing to reset —
        // matching reset-while-paused; the deferred zero lands on the next
        // resume (which hits the `start()` below via becameActive).
        stop();
        return;
      }
      // Active. Ink resets+re-subscribes only when something relevant changed:
      // the animation just became active, or the interval changed while active.
      // (Vue's watch fires only on a real change, so on a pure re-render with an
      // unchanged interval this watcher does not run at all — no reset, matching
      // Ink's "rerender with same interval does not reset".)
      if (becameActive || intervalChanged) start();
    },
    { immediate: true, flush: "post" },
  );

  onScopeDispose(stop);

  return { frame, time, delta, reset };
}
