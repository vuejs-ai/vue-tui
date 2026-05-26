import { inject } from "vue";
import { AppContextKey } from "../context.ts";

export function useIsScreenReaderEnabled(): boolean {
  const ctx = inject(AppContextKey);
  if (!ctx)
    throw new Error("useIsScreenReaderEnabled() must be called inside a vue-tui render tree");
  return ctx.isScreenReaderEnabled;
}
