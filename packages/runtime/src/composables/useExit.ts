import { inject } from "vue";
import { AppContextKey } from "../context.ts";

/**
 * Returns the exit function so a component can end the app from inside the
 * tree. Pass an Error to reject `app.waitUntilExit()` (and any awaiter); pass
 * any other value to resolve with it as the result; call with no args to
 * resolve with undefined.
 */
export function useExit(): (errorOrResult?: unknown) => void {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useExit() must be called inside a vue-tui render tree");
  return ctx.exit;
}
