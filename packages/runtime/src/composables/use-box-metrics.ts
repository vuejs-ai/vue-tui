import { readonly, shallowRef, type Ref } from "vue";
import type { PublicBoxInstance } from "../components/public-box.ts";
import { useInternalBoxSize } from "../geometry/internal-use-box-size.ts";
import type { TuiBox } from "../host/nodes.ts";
import { useDirectBoxTarget } from "./direct-box-target.ts";

/** Readonly reactive parent-relative layout rectangle for one direct Box. */
export interface UseBoxMetricsReturn {
  readonly width: Readonly<Ref<number>>;
  readonly height: Readonly<Ref<number>>;
  readonly left: Readonly<Ref<number>>;
  readonly top: Readonly<Ref<number>>;
  readonly hasMeasured: Readonly<Ref<boolean>>;
}

/**
 * Observe the last accepted layout rectangle of one directly referenced Box.
 *
 * Before the first accepted measurement, and while the target is detached,
 * unmounted, retargeted, or excluded from layout by `v-show`, the four numbers
 * are zero and `hasMeasured` is false. A real zero-sized Box reports zero size
 * with `hasMeasured` true. Pending repaint or temporary suspension for the same
 * target retains the last accepted values.
 */
export function useBoxMetrics<T extends PublicBoxInstance>(
  target: Readonly<Ref<T | null | undefined>>,
): UseBoxMetricsReturn {
  const { resolve: resolvePublicBox } = useDirectBoxTarget("useBoxMetrics", target);

  const mutableWidth = shallowRef(0);
  const mutableHeight = shallowRef(0);
  const mutableLeft = shallowRef(0);
  const mutableTop = shallowRef(0);
  const mutableHasMeasured = shallowRef(false);
  let currentTarget: TuiBox | null = null;
  let hasAcceptedMetrics = false;

  const clear = (): void => {
    hasAcceptedMetrics = false;
    if (mutableWidth.value !== 0) mutableWidth.value = 0;
    if (mutableHeight.value !== 0) mutableHeight.value = 0;
    if (mutableLeft.value !== 0) mutableLeft.value = 0;
    if (mutableTop.value !== 0) mutableTop.value = 0;
    if (mutableHasMeasured.value) mutableHasMeasured.value = false;
  };

  const publish = (width: number, height: number, left: number, top: number): void => {
    hasAcceptedMetrics = true;
    if (
      mutableWidth.value === width &&
      mutableHeight.value === height &&
      mutableLeft.value === left &&
      mutableTop.value === top &&
      mutableHasMeasured.value
    ) {
      return;
    }
    // Publish all four numeric facts from one coherent snapshot before flipping
    // hasMeasured, so a reactive observer never sees mixed generations.
    mutableWidth.value = width;
    mutableHeight.value = height;
    mutableLeft.value = left;
    mutableTop.value = top;
    mutableHasMeasured.value = true;
  };

  useInternalBoxSize(resolvePublicBox, (state, resolvedTarget) => {
    if (resolvedTarget !== currentTarget) {
      currentTarget = resolvedTarget;
      clear();
    }

    if (resolvedTarget === null || state.status === "detached") {
      clear();
      return;
    }
    if (state.status === "hidden") {
      clear();
      return;
    }
    if (state.status !== "resolved") {
      // Pending paint and temporary surface unavailability do not erase the
      // last metrics accepted for this same Box.
      if (!hasAcceptedMetrics) clear();
      return;
    }

    publish(state.width, state.height, state.left, state.top);
  });

  return Object.freeze({
    width: readonly(mutableWidth) as Readonly<Ref<number>>,
    height: readonly(mutableHeight) as Readonly<Ref<number>>,
    left: readonly(mutableLeft) as Readonly<Ref<number>>,
    top: readonly(mutableTop) as Readonly<Ref<number>>,
    hasMeasured: readonly(mutableHasMeasured) as Readonly<Ref<boolean>>,
  });
}
