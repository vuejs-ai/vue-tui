import { nextTick, shallowRef, type Ref, type ShallowRef } from "vue";
import { addLayoutListener } from "../host/nodes.ts";
import { findRootNode, resolveTuiNode, resolveYogaNode } from "../host/resolve-node.ts";
import { useRenderedTargetRegistration } from "../rendered-target.ts";

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
 * Imperative function that reads yoga computed dimensions from a TUI node.
 *
 * Returns `{ width: 0, height: 0 }` when the ref is not attached to an element,
 * and also as a safe fallback when the node's computed dimension is non-finite —
 * i.e. it has a yoga node but has not been through a layout pass yet (yoga
 * reports `NaN` pre-layout). `0` here is a sentinel meaning "not yet computed",
 * NOT the box's true size; the correct pattern is to read *after* layout (see the
 * timing note below).
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
  // yoga returns NaN for a node not yet through a layout pass, and `?? 0` does
  // NOT catch NaN (NaN ?? 0 === NaN). Coerce non-finite dims to 0 so a pre-layout
  // / mis-timed read degrades to {0,0} instead of leaking NaN into user layout
  // math. 0 is a SAFE SENTINEL, not the true size (which is "not yet computed");
  // the correct usage is to read AFTER layout (see the timing note in the JSDoc).
  // Matches the DOM precedent (getBoundingClientRect on display:none /
  // img.naturalWidth pre-load → 0, not NaN). Deliberate divergence from Ink
  // v7.0.4's NaN-leaking `?? 0`.
  const width = tuiNode.yoga.getComputedWidth();
  const height = tuiNode.yoga.getComputedHeight();
  return {
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
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

  let activeTarget: ReturnType<typeof resolveTuiNode> = null;

  function resetMetrics() {
    const changed = width.value !== 0 || height.value !== 0 || left.value !== 0 || top.value !== 0;
    if (changed) {
      width.value = 0;
      height.value = 0;
      left.value = 0;
      top.value = 0;
    }
    if (hasMeasured.value) hasMeasured.value = false;
  }

  function updateMetrics() {
    const node = resolveYogaNode(activeTarget);
    if (!node) {
      resetMetrics();
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

  useRenderedTargetRegistration(
    () => {
      const target = resolveTuiNode(ref.value);
      return resolveYogaNode(target) ? target : null;
    },
    (target) => {
      const root = findRootNode(target);
      if (!root) return;
      activeTarget = target;
      const removeLayoutListener = addLayoutListener(root, updateMetrics);
      // A ref can be reassigned to an already-laid-out target without causing a
      // renderer commit. The root listener handles normal commits; this deferred
      // read covers that no-render retarget without reading pre-layout Yoga data.
      void nextTick(() => {
        if (activeTarget === target) updateMetrics();
      });
      return () => {
        removeLayoutListener();
        if (activeTarget !== target) return;
        activeTarget = null;
        resetMetrics();
      };
    },
  );

  return { width, height, left, top, hasMeasured };
}
