import { inject } from "vue";
import { AppContextKey } from "../context.ts";

/** The public app-lifecycle surface returned by {@link useApp}. Mirrors Ink's `useApp()`. */
export interface UseAppReturn {
  readonly exit: (error?: Error) => void;
}

/**
 * Access app-level lifecycle controls from inside the render tree.
 *
 * - `exit()` ends the app; passing an `Error` rejects `app.waitUntilExit()` with
 *   it after the host is restored.
 * - Deliberately narrow — the `waitUntilExit()` and `waitUntilRenderFlush()`
 *   barriers stay on the `createApp()` owner.
 *
 * @example Quit when the user presses Escape
 * ```tsx
 * const { exit } = useApp();
 * useInput((event) => {
 *   if (event.key?.name === "escape") exit();
 * });
 * ```
 *
 * @example End the run as a failure
 * ```ts
 * const { exit } = useApp();
 * exit(new Error("config file missing")); // app.waitUntilExit() rejects with it
 * ```
 */
export function useApp(): UseAppReturn {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useApp() must be called inside a vue-tui render tree");
  return { exit: ctx.exit };
}
