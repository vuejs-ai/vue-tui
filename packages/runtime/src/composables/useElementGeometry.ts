import {
  readonly,
  shallowRef,
  type ComponentPublicInstance,
  type MaybeRefOrGetter,
  type ShallowRef,
} from "vue";
import { useInternalElementGeometry } from "../geometry/internal-use-element-geometry.ts";
import type { InternalElementGeometry } from "../geometry/geometry-service.ts";

/** A rendered terminal cell relative to a documented coordinate space. */
export interface CellPoint {
  readonly x: number;
  readonly y: number;
}

/** A rectangular rendered extent in terminal cells. */
export interface CellRect extends CellPoint {
  readonly width: number;
  readonly height: number;
}

/** One exact mapping of a rendered extent through the element coordinate spaces. */
export interface ElementGeometryFragment {
  /** Exact rendered extent in the target's local cells. */
  readonly local: CellRect;
  /** The same region relative to the nearest rendered parent. */
  readonly parent: CellRect;
  /** The same region relative to the current dynamic render surface. */
  readonly surface: CellRect;
  /** Clipped rectangle in surface coordinates, or null when this fragment is not visible. */
  readonly visibleSurface: CellRect | null;
}

interface ResolvedElementGeometry {
  /** Bounding box relative to the nearest rendered parent. */
  readonly parent: CellRect;
  /** Full bounding box relative to the current dynamic render surface. */
  readonly surface: CellRect;
  /** Exact local-to-parent-to-surface rendered mappings. */
  readonly fragments: readonly ElementGeometryFragment[];
}

/** One atomic geometry result from the latest authoritative paint generation. */
export type ElementGeometry =
  | { readonly status: "unavailable" }
  | { readonly status: "detached" }
  | { readonly status: "pending" }
  | { readonly status: "hidden" }
  | (ResolvedElementGeometry & {
      readonly status: "zero-size" | "fully-clipped" | "visible";
    });

/** A normal Vue component ref or getter that resolves to a rendered vue-tui element. */
export type ElementTarget = MaybeRefOrGetter<ComponentPublicInstance | null | undefined>;

export interface UseElementGeometryReturn {
  /** The latest complete geometry generation. This ref and every snapshot are readonly. */
  readonly geometry: Readonly<ShallowRef<ElementGeometry>>;
}

const UNAVAILABLE = Object.freeze({ status: "unavailable" as const });
const DETACHED = Object.freeze({ status: "detached" as const });
const PENDING = Object.freeze({ status: "pending" as const });
const HIDDEN = Object.freeze({ status: "hidden" as const });

function toPublicGeometry(geometry: InternalElementGeometry): ElementGeometry {
  if (geometry.status === "unavailable") return UNAVAILABLE;
  if (geometry.status === "detached") return DETACHED;
  if (geometry.status === "pending") return PENDING;
  if (geometry.status === "hidden") return HIDDEN;

  // The internal generation also owns sparse insertion slots for useCaret().
  // Project rather than cast so JavaScript consumers cannot observe or mutate
  // that private renderer data through the supported geometry API.
  return Object.freeze({
    status: geometry.status,
    parent: geometry.parent,
    surface: geometry.surface,
    fragments: geometry.fragments,
  });
}

/** Observe semantic geometry for one rendered Vue component target. */
export function useElementGeometry(target: ElementTarget): UseElementGeometryReturn {
  const mutableGeometry = shallowRef<ElementGeometry>(UNAVAILABLE);
  useInternalElementGeometry(target, (geometry) => {
    mutableGeometry.value = toPublicGeometry(geometry);
  });

  return Object.freeze({
    geometry: readonly(mutableGeometry) as Readonly<ShallowRef<ElementGeometry>>,
  });
}
