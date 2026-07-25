import { computed, type Ref } from "vue";
import { useInternalRenderSession } from "../render-session.ts";

/** Readonly reactive root-layout dimensions from one accepted snapshot. */
export interface UseLayoutSizeReturn {
  readonly width: Readonly<Ref<number>>;
  readonly height: Readonly<Ref<number>>;
}

/**
 * Return the terminal-cell width and height Runtime makes available to the root layout.
 *
 * These are layout inputs from one accepted dimension snapshot, not physical terminal
 * properties and not a component's measured rectangle. `height === Infinity` means
 * Runtime imposes no vertical layout bound.
 */
export function useLayoutSize(): UseLayoutSizeReturn {
  const session = useInternalRenderSession().session;

  // Both refs read from the same reactive `dimensions` object, which
  // `updateDimensions` replaces atomically so observers never see mixed generations.
  const width = computed(() => session.dimensions.layout.columns);
  const height = computed(() => {
    const rows = session.dimensions.layout.rows;
    return rows === null ? Number.POSITIVE_INFINITY : rows;
  });

  return Object.freeze({ width, height });
}
