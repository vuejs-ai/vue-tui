import { computed, inject, shallowRef, type Ref } from "vue";
import { AppContextKey } from "../context.ts";
import { useOptionalInternalRenderSession } from "../render-session.ts";

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
  const service = useOptionalInternalRenderSession();
  if (!service) {
    // Temporary string-renderer compatibility until F1.5 supplies the same
    // render-session service to document hosts.
    const ctx = inject(AppContextKey);
    if (!ctx) throw new Error("useWindowSize() must be called inside a vue-tui render tree");
    return {
      columns: shallowRef(ctx.stdout.columns || 80),
      rows: shallowRef(ctx.stdout.rows || 24),
    };
  }
  return {
    columns: computed(() => service.session.dimensions.layout.columns),
    rows: service.legacyWindowRows,
  };
}
