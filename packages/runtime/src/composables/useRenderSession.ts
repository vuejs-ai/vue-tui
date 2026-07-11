import type { RenderSession } from "../render-session.ts";
import { useInternalRenderSession } from "../render-session.ts";

/** Return the readonly facts for the current vue-tui render host and surface. */
export function useRenderSession(): RenderSession {
  return useInternalRenderSession().session as RenderSession;
}
