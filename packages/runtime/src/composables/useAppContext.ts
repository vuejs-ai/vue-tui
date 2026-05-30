import { inject } from "vue";
import { AppContextKey } from "../context.ts";

/**
 * Returns the app-level context for a component inside the render tree:
 *
 * - `exit(error?)` — end the app. Pass an `Error` to reject `app.waitUntilExit()`
 *   (and any awaiter); pass any other value to resolve with it as the result;
 *   call with no args to resolve with `undefined`.
 * - `waitUntilRenderFlush()` — resolve once the next frame has been committed and
 *   flushed to the output stream.
 *
 * Mirrors Ink's `useApp()` (which returns `{ exit, waitUntilRenderFlush }`). It
 * is named `useAppContext` rather than `useApp` to avoid colliding with Vue's
 * own "App" mental model (`createApp`, the Vue application instance) — the same
 * Vue-native-naming choice vue-tui makes with `createApp()` vs Ink's `render()`.
 * Streams remain on their dedicated peer composables (`useStdin`, `useStdout`,
 * `useStderr`), exactly as in Ink.
 */
export function useAppContext(): {
  exit: (errorOrResult?: unknown) => void;
  waitUntilRenderFlush: () => Promise<void>;
} {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useAppContext() must be called inside a vue-tui render tree");
  return { exit: ctx.exit, waitUntilRenderFlush: ctx.waitUntilRenderFlush };
}
