import { nextTick, shallowRef, watchPostEffect, type Ref, type ShallowRef } from "vue";
import type { Node as YogaNode } from "yoga-layout";
import { addLayoutListener, type TuiNode, type TuiRoot } from "../host/nodes.ts";

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

export interface UseBoxMetricsReturn {
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

/** Resolve a ref value to its underlying TUI node (for tree traversal). */
function resolveTuiNode(value: unknown): TuiNode | null {
  if (!value) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.type === "string") return obj as unknown as TuiNode;
  // Vue component instance — root host element is on $el
  if (obj.$el && typeof (obj.$el as Record<string, unknown>).type === "string") {
    return obj.$el as unknown as TuiNode;
  }
  return null;
}

/** Walk up the DOM tree to find the root node. */
function findRootNode(node: TuiNode | null): TuiRoot | null {
  let current: TuiNode | null = node;
  while (current) {
    if (current.type === "root") return current;
    current = current.parent;
  }
  return null;
}

/**
 * Imperative function that reads yoga computed dimensions from a TUI node.
 *
 * Returns `{ width: 0, height: 0 }` when the ref is not attached to an element.
 *
 * Timing matters: layout is computed inside the commit scheduler's post-flush
 * callback, which can run *after* your own `watchPostEffect`/render-time code in
 * the same flush. A bare `measureElement()` called there reads layout that has
 * not been recalculated yet, so it does not return the current size. Read it
 * only *after* the layout commit:
 * - wrap the read in `nextTick(() => measureElement(ref.value))` (the pattern
 *   {@link useBoxMetrics} itself uses), or
 * - call it from an input handler or timer callback that fires after a flush.
 *
 * For reactive metrics that stay in sync across renders and resizes, prefer
 * {@link useBoxMetrics}, which handles this timing for you.
 *
 * @example
 * ```tsx
 * const boxRef = ref(null);
 * watchPostEffect(() => {
 *   // Defer the read so it runs after layout is committed.
 *   void nextTick(() => {
 *     const { width } = measureElement(boxRef.value);
 *   });
 * });
 * ```
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
 * Subscribes to the root node's layout listener so metrics update on terminal
 * resize and sibling layout changes, even when the tracked ref doesn't change.
 * Matches Ink's useBoxMetrics architecture.
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
export function useBoxMetrics(ref: Ref<unknown>): UseBoxMetricsReturn {
  const width = shallowRef(0);
  const height = shallowRef(0);
  const left = shallowRef(0);
  const top = shallowRef(0);
  const hasMeasured = shallowRef(false);

  function updateMetrics() {
    const node = resolveYogaNode(ref.value);
    if (!node) {
      // Reset to zeros when detached
      const changed =
        width.value !== 0 || height.value !== 0 || left.value !== 0 || top.value !== 0;
      if (changed) {
        width.value = 0;
        height.value = 0;
        left.value = 0;
        top.value = 0;
      }
      if (hasMeasured.value) hasMeasured.value = false;
      return;
    }

    const w = node.yoga.getComputedWidth();
    const h = node.yoga.getComputedHeight();
    const l = node.yoga.getComputedLeft();
    const t = node.yoga.getComputedTop();

    // Only update refs if values actually changed (avoids unnecessary re-renders)
    if (width.value !== w) width.value = w;
    if (height.value !== h) height.value = h;
    if (left.value !== l) left.value = l;
    if (top.value !== t) top.value = t;
    if (!hasMeasured.value) hasMeasured.value = true;
  }

  // Track the current layout listener unsubscribe function so we can
  // re-subscribe when the ref changes (and the root node might differ).
  let removeLayoutListener: (() => void) | undefined;

  function subscribeToLayout() {
    // Clean up previous subscription
    if (removeLayoutListener) {
      removeLayoutListener();
      removeLayoutListener = undefined;
    }

    const tuiNode = resolveTuiNode(ref.value);
    const root = findRootNode(tuiNode);
    if (!root) return;

    removeLayoutListener = addLayoutListener(root, updateMetrics);
  }

  // Re-measure after each render commit. watchPostEffect triggers when the
  // ref changes (component mount / unmount). The yoga layout is calculated
  // inside the commit scheduler's queuePostFlushCb, which may run after this
  // watcher in the same flush cycle. We use nextTick to defer the read so
  // that it runs after the scheduler's commit has called calculateLayout.
  //
  // This also re-subscribes to the layout listener in case the ref moved
  // to a different node (and thus potentially a different root).
  watchPostEffect((onCleanup) => {
    // Access ref.value to track the dependency — when the ref changes,
    // this effect re-runs and schedules a new measurement.
    const node = resolveYogaNode(ref.value);
    if (!node) {
      // Detached: reset metrics and clean up listener
      const changed =
        width.value !== 0 || height.value !== 0 || left.value !== 0 || top.value !== 0;
      if (changed) {
        width.value = 0;
        height.value = 0;
        left.value = 0;
        top.value = 0;
      }
      if (hasMeasured.value) hasMeasured.value = false;
      if (removeLayoutListener) {
        removeLayoutListener();
        removeLayoutListener = undefined;
      }
      return;
    }

    // Subscribe (or re-subscribe) to layout listener
    subscribeToLayout();

    // Defer the initial read to after calculateLayout runs
    void nextTick(updateMetrics);

    onCleanup(() => {
      if (removeLayoutListener) {
        removeLayoutListener();
        removeLayoutListener = undefined;
      }
    });
  });

  return { width, height, left, top, hasMeasured };
}
