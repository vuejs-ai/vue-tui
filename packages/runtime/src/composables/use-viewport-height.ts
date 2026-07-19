import { computed, type Ref } from "vue";
import { useInternalRenderSession } from "../render-session.ts";

/** Return the reactive visual viewport height, or null when layout is unbounded. */
export function useViewportHeight(): Readonly<Ref<number>> | null {
  const session = useInternalRenderSession().session;
  if (session.dimensions.layout.rows === null) return null;

  return computed(() => {
    const rows = session.dimensions.layout.rows;
    if (rows === null) {
      throw new Error("a bounded vue-tui render session became unbounded");
    }
    return rows;
  });
}
