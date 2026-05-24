import { inject } from "vue";
import { AppContextKey } from "../context.ts";

/**
 * Returns the exit function so a component can end the app from inside the
 * tree. Pass an Error to reject `app.waitUntilExit()` (and any awaiter); call
 * with no args to resolve cleanly.
 */
export function useExit(): (error?: Error) => void {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useExit() must be called inside a vue-tui render tree");
  return ctx.exit;
}
