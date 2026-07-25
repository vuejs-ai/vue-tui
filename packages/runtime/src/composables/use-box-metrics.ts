import { shallowRef, toRef, type Ref } from "vue";
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

interface BoxMetricsSnapshot {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly hasMeasured: boolean;
}

const EMPTY_METRICS: BoxMetricsSnapshot = Object.freeze({
  width: 0,
  height: 0,
  left: 0,
  top: 0,
  hasMeasured: false,
});

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

  const snapshot = shallowRef<BoxMetricsSnapshot>(EMPTY_METRICS);
  let currentTarget: TuiBox | null = null;
  let hasAcceptedMetrics = false;

  const clear = (): void => {
    hasAcceptedMetrics = false;
    if (snapshot.value !== EMPTY_METRICS) snapshot.value = EMPTY_METRICS;
  };

  const publish = (width: number, height: number, left: number, top: number): void => {
    hasAcceptedMetrics = true;
    const current = snapshot.value;
    if (
      current.width === width &&
      current.height === height &&
      current.left === left &&
      current.top === top &&
      current.hasMeasured
    ) {
      return;
    }
    snapshot.value = Object.freeze({
      width,
      height,
      left,
      top,
      hasMeasured: true,
    });
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

  // Getter refs always read the one current snapshot and do not own cached
  // component-scope effects. They therefore remain accurate when disposal
  // clears the snapshot after Vue has begun stopping the component scope.
  const width = toRef(() => snapshot.value.width);
  const height = toRef(() => snapshot.value.height);
  const left = toRef(() => snapshot.value.left);
  const top = toRef(() => snapshot.value.top);
  const hasMeasured = toRef(() => snapshot.value.hasMeasured);

  return Object.freeze({
    width,
    height,
    left,
    top,
    hasMeasured,
  });
}
