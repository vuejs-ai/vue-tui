import { useInternalRenderSession } from "../render-session.ts";

export function useIsScreenReaderEnabled(): boolean {
  return useInternalRenderSession().session.output.presentation === "screen-reader";
}
