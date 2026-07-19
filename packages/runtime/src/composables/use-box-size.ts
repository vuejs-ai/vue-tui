import { readonly, shallowRef, type Ref } from "vue";
import type { PublicBoxInstance } from "../components/public-box.ts";
import { useInternalElementGeometry } from "../geometry/internal-use-element-geometry.ts";
import type { InternalElementGeometry } from "../geometry/geometry-service.ts";
import type { TuiNode } from "../host/nodes.ts";
import { useDirectBoxTarget } from "./direct-box-target.ts";

/** The full layout size of a Box in terminal cells. */
export interface BoxSize {
  readonly width: number;
  readonly height: number;
}

function isResolved(
  geometry: InternalElementGeometry,
): geometry is Extract<
  InternalElementGeometry,
  { readonly status: "zero-size" | "fully-clipped" | "visible" }
> {
  return (
    geometry.status === "zero-size" ||
    geometry.status === "fully-clipped" ||
    geometry.status === "visible"
  );
}

/** Observe the last size of one directly referenced Box whose visual paint was accepted. */
export function useBoxSize<T extends PublicBoxInstance>(
  target: Readonly<Ref<T | null | undefined>>,
): Readonly<Ref<BoxSize | null>> {
  const { resolve: resolvePublicBox } = useDirectBoxTarget("useBoxSize", target);

  const mutableSize = shallowRef<BoxSize | null>(null);
  let currentTarget: TuiNode | null = null;
  let hasAcceptedSize = false;

  const clear = (): void => {
    hasAcceptedSize = false;
    if (mutableSize.value !== null) mutableSize.value = null;
  };

  useInternalElementGeometry(resolvePublicBox, (geometry, resolvedTarget) => {
    if (resolvedTarget !== currentTarget) {
      currentTarget = resolvedTarget;
      clear();
    }

    if (resolvedTarget === null || geometry.status === "detached") {
      clear();
      return;
    }
    if (geometry.status === "hidden") {
      clear();
      return;
    }
    if (!isResolved(geometry)) {
      // Pending paint and temporary surface unavailability do not erase the
      // last size accepted for this same Box.
      if (!hasAcceptedSize) clear();
      return;
    }

    const width = geometry.parent.width;
    const height = geometry.parent.height;
    const previous = mutableSize.value;
    hasAcceptedSize = true;
    if (previous?.width === width && previous.height === height) return;
    mutableSize.value = Object.freeze({ width, height });
  });

  return readonly(mutableSize) as Readonly<Ref<BoxSize | null>>;
}
