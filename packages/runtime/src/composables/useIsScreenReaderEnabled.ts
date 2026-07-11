import { inject } from "vue";
import { AppContextKey } from "../context.ts";
import { useOptionalInternalRenderSession } from "../render-session.ts";

export function useIsScreenReaderEnabled(): boolean {
  const service = useOptionalInternalRenderSession();
  if (service) return service.session.output.presentation === "screen-reader";

  // Temporary string-renderer compatibility until F1.5 supplies a document
  // render session. Live mounts never use this legacy fact path.
  const ctx = inject(AppContextKey);
  if (!ctx)
    throw new Error("useIsScreenReaderEnabled() must be called inside a vue-tui render tree");
  return ctx.isScreenReaderEnabled;
}
