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

export interface AnimationOptions {
  /**
   * Time between ticks in milliseconds.
   * @default 100
   */
  interval?: number;

  /**
   * Whether the animation is running. When set to `false`, the animation stops.
   * When toggled back to `true`, all values reset to `0`.
   * @default true
   */
  isActive?: MaybeRefOrGetter<boolean>;
}

export interface AnimationResult {
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
   * Resets `frame`, `time`, and `delta` to `0` and restarts timing from the current moment.
   * Useful for one-shot animations triggered by events.
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
export function useAnimation(options: AnimationOptions = {}): AnimationResult {
  const frame = shallowRef(0);
  const time = shallowRef(0);
  const delta = shallowRef(0);

  const interval = normalizeInterval(options.interval);
  // Fall back to a local standalone scheduler when used outside a vue-tui
  // render tree (graceful degradation, not a silent break).
  const scheduler: AnimationScheduler =
    inject(AnimationSchedulerKey, null) ?? createAnimationScheduler();

  let handle: { startTime: number; unsubscribe: () => void } | undefined;
  let startTime = 0;
  let lastTickTime = 0;

  function tick(now: number) {
    frame.value = Math.floor((now - startTime) / interval);
    time.value = now - startTime;
    delta.value = now - lastTickTime;
    lastTickTime = now;
  }

  function start() {
    stop();
    frame.value = 0;
    time.value = 0;
    delta.value = 0;
    handle = scheduler.subscribe(tick, interval);
    startTime = handle.startTime;
    lastTickTime = handle.startTime;
  }

  function stop() {
    if (handle) {
      handle.unsubscribe();
      handle = undefined;
    }
  }

  function reset() {
    const wasActive = handle !== undefined;
    frame.value = 0;
    time.value = 0;
    delta.value = 0;
    if (wasActive) start();
  }

  // Watch isActive — when toggled to true, start (which resets values);
  // when toggled to false, stop (values freeze).
  const isActive = options.isActive ?? true;
  watch(
    () => toValue(isActive),
    (active) => {
      if (active) start();
      else stop();
    },
    { immediate: true, flush: "sync" },
  );

  onScopeDispose(stop);

  return { frame, time, delta, reset };
}
