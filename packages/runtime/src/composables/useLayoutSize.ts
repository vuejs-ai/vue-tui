import { computed, type Ref } from "vue";
import { useInternalRenderSession } from "../render-session.ts";

export interface UseLayoutSizeReturn {
  /** Reactive root layout width in terminal cells. */
  readonly columns: Readonly<Ref<number>>;
  /** Reactive enforced row bound, or `null` when the layout is unbounded. */
  readonly rows: Readonly<Ref<number | null>>;
}

/** Return reactive dimensions for the root area the renderer actually lays out. */
export function useLayoutSize(): UseLayoutSizeReturn {
  const session = useInternalRenderSession().session;
  return {
    columns: computed(() => session.dimensions.layout.columns),
    rows: computed(() => session.dimensions.layout.rows),
  };
}
