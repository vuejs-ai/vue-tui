import { nextTick, shallowRef, watchPostEffect, type Ref, type ShallowRef } from "vue";
import type { Node as YogaNode } from "yoga-layout";

// Yoga's `right`/`bottom` are omitted: always `0` for flow layout and
// unintuitive for absolute positioning. Matches Ink's BoxMetrics type.

export interface BoxMetrics {
  /** Element width. */
  readonly width: number;
  /** Element height. */
  readonly height: number;
  /** Distance from the left edge of the parent. */
  readonly left: number;
  /** Distance from the top edge of the parent. */
  readonly top: number;
}

export interface UseBoxMetricsResult {
  /** Reactive element width. */
  readonly width: ShallowRef<number>;
  /** Reactive element height. */
  readonly height: ShallowRef<number>;
  /** Reactive distance from the left edge of the parent. */
  readonly left: ShallowRef<number>;
  /** Reactive distance from the top edge of the parent. */
  readonly top: ShallowRef<number>;
  /** Whether the currently tracked element has been measured in the latest layout pass. */
  readonly hasMeasured: ShallowRef<boolean>;
}

/**
 * Resolve a ref value to the underlying TUI node with a yoga property.
 * Handles both direct TUI node refs and Vue component instance refs (where
 * the TUI node is accessible via `$el`).
 */
function resolveYogaNode(value: unknown): { yoga: YogaNode } | null {
  if (!value) return null;
  const obj = value as Record<string, unknown>;
  // Direct TUI node (e.g. from host element ref)
  if (obj.yoga) return obj as { yoga: YogaNode };
  // Vue component instance — root host element is on $el
  if (obj.$el && (obj.$el as Record<string, unknown>).yoga) {
    return obj.$el as { yoga: YogaNode };
  }
  return null;
}

/**
 * Imperative function that reads yoga computed dimensions from a TUI node.
 *
 * Returns `{ width: 0, height: 0 }` before layout (when yoga node doesn't
 * exist or hasn't been calculated).
 *
 * Note: `measureElement()` returns `{width: 0, height: 0}` when called during
 * render (before layout is calculated). Call it from post-render code, such as
 * `watchPostEffect`, `onMounted`, input handlers, or timer callbacks.
 */
export function measureElement(node: unknown): { width: number; height: number } {
  const tuiNode = resolveYogaNode(node);
  if (!tuiNode) return { width: 0, height: 0 };
  return {
    width: tuiNode.yoga.getComputedWidth() ?? 0,
    height: tuiNode.yoga.getComputedHeight() ?? 0,
  };
}

/**
 * Reactive composable that returns computed layout metrics for a tracked box element.
 * Updates after each render commit when yoga layout has been calculated.
 *
 * Returns `{ width, height, left, top, hasMeasured }` where all values are
 * reactive refs. `hasMeasured` starts `false` and becomes `true` after the
 * first layout pass.
 *
 * @example
 * ```tsx
 * const boxRef = ref(null);
 * const { width, height, left, top, hasMeasured } = useBoxMetrics(boxRef);
 * return () => (
 *   <Box ref={boxRef}>
 *     <Text>{hasMeasured.value ? `${width.value}x${height.value}` : "Measuring..."}</Text>
 *   </Box>
 * );
 * ```
 */
export function useBoxMetrics(ref: Ref<unknown>): UseBoxMetricsResult {
  const width = shallowRef(0);
  const height = shallowRef(0);
  const left = shallowRef(0);
  const top = shallowRef(0);
  const hasMeasured = shallowRef(false);

  function measure() {
    const node = resolveYogaNode(ref.value);
    if (!node) return;
    width.value = node.yoga.getComputedWidth();
    height.value = node.yoga.getComputedHeight();
    left.value = node.yoga.getComputedLeft();
    top.value = node.yoga.getComputedTop();
    hasMeasured.value = true;
  }

  function reset() {
    width.value = 0;
    height.value = 0;
    left.value = 0;
    top.value = 0;
    hasMeasured.value = false;
  }

  // Re-measure after each render commit. watchPostEffect triggers when the
  // ref changes (component mount / unmount). The yoga layout is calculated
  // inside the commit scheduler's queuePostFlushCb, which may run after this
  // watcher in the same flush cycle. We use nextTick to defer the read so
  // that it runs after the scheduler's commit has called calculateLayout.
  watchPostEffect(() => {
    // Access ref.value to track the dependency — when the ref changes,
    // this effect re-runs and schedules a new measurement.
    const node = resolveYogaNode(ref.value);
    if (!node) {
      reset();
      return;
    }
    void nextTick(measure);
  });

  return { width, height, left, top, hasMeasured };
}
