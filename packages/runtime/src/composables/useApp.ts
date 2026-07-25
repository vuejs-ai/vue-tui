import { inject } from "vue";
import { AppContextKey } from "../context.ts";

/** The public app-lifecycle surface returned by {@link useApp}. Mirrors Ink's `useApp()`. */
export interface UseAppReturn {
  readonly exit: (error?: Error) => void;
}

/**
 * Returns app-level lifecycle controls for a component inside the render tree:
 *
 * `exit()` ends the app normally. Passing an `Error` rejects
 * `app.waitUntilExit()` with that same error after Runtime restores the host.
 */
export function useApp(): UseAppReturn {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useApp() must be called inside a vue-tui render tree");
  return { exit: ctx.exit };
}
