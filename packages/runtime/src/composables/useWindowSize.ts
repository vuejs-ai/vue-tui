import { computed, type Ref } from "vue";
import { useInternalRenderSession } from "../render-session.ts";

/** A terminal's character-cell dimensions. */
export interface WindowSize {
  readonly columns: number;
  readonly rows: number;
}

/**
 * Return the current layout width and the legacy numeric row projection.
 *
 * F1.4 keeps this public hook temporarily, but its facts now come from the
 * application's single render-session resolver. It no longer probes process
 * globals or registers one resize listener per consumer. F1.8 replaces it with
 * useLayoutSize(), whose rows value can honestly be null for unbounded Inline.
 */
export function useWindowSize(): {
  columns: Readonly<Ref<number>>;
  rows: Readonly<Ref<number>>;
} {
  const service = useInternalRenderSession();
  return {
    columns: computed(() => service.session.dimensions.layout.columns),
    rows: service.legacyWindowRows,
  };
}
