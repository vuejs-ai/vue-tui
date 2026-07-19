import { computed, type Ref } from "vue";
import { useInternalRenderSession } from "../render-session.ts";

/** Return the reactive width Runtime actually gives the root layout. */
export function useLayoutWidth(): Readonly<Ref<number>> {
  const session = useInternalRenderSession().session;
  return computed(() => session.dimensions.layout.columns);
}
