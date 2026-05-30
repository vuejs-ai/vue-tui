import { inject } from "vue";
import { AppContextKey } from "../context.ts";

/** The public app-lifecycle surface returned by {@link useApp}. Mirrors Ink's `useApp()`. */
export interface UseAppReturn {
  readonly exit: (errorOrResult?: unknown) => void;
  readonly waitUntilRenderFlush: () => Promise<void>;
}

/**
 * Returns app-level lifecycle controls for a component inside the render tree:
 *
 * - `exit(error?)` — end the app. Pass an `Error` to reject `app.waitUntilExit()`
 *   (and any awaiter); pass any other value to resolve with it as the result;
 *   call with no args to resolve with `undefined`.
 * - `waitUntilRenderFlush()` — resolve once the next frame has been committed and
 *   flushed to the output stream.
 *
 * Mirrors Ink's `useApp()`. Streams are reached through the dedicated peer
 * composables (`useStdin`, `useStdout`, `useStderr`), exactly as in Ink.
 */
export function useApp(): UseAppReturn {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useApp() must be called inside a vue-tui render tree");
  return { exit: ctx.exit, waitUntilRenderFlush: ctx.waitUntilRenderFlush };
}
