import { computed, type Ref } from "vue";
import { useInternalRenderSession } from "../render-session.ts";

/** Readonly reactive root-layout dimensions from one accepted snapshot. */
export interface UseLayoutSizeReturn {
  readonly width: Readonly<Ref<number>>;
  readonly height: Readonly<Ref<number>>;
}

/**
 * Read the terminal-cell width and height Runtime gives the root layout.
 *
 * - One accepted layout snapshot — not physical terminal columns and rows, and
 *   not a measured rectangle.
 * - `height === Infinity` means no vertical bound.
 *
 * @example Draw a rule across the full width
 * ```tsx
 * const { width } = useLayoutSize();
 * return () => <Text>{"-".repeat(width.value)}</Text>;
 * ```
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
