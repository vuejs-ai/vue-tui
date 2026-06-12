import { inject, shallowRef, watch, onScopeDispose } from "vue";
import { AppContextKey } from "../context.ts";

/**
 * A cursor position in output-origin coordinates. Mirrors Ink's `CursorPosition`.
 */
export interface CursorPosition {
  x: number;
  y: number;
}

/**
 * Returns `setCursorPosition` so a component can control the terminal cursor.
 *
 * Setting a position makes the cursor visible at the given coordinates
 * (relative to the output origin). Pass `undefined` to hide the cursor.
 *
 * The declared position **persists**: the runtime re-asserts it at the end of
 * every frame, so the caret stays put across unrelated repaints (a spinner tick,
 * a log line) until you set a new position or clear it — you do not need to
 * re-set it on every render. The position is automatically cleared when the
 * component unmounts.
 */
export function useCursor() {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useCursor() must be called inside a vue-tui render tree");

  const positionRef = shallowRef<CursorPosition | undefined>(undefined);

  function setCursorPosition(position: CursorPosition | undefined) {
    positionRef.value = position;
  }

  // Propagate cursor position to app context synchronously so it is
  // available to restoreLastOutput() after the next render commit.
  watch(
    positionRef,
    (pos) => {
      ctx.setCursorPosition(pos);
    },
    { flush: "sync" },
  );

  // On unmount, clear cursor position so the cursor is hidden.
  onScopeDispose(() => {
    ctx.setCursorPosition(undefined);
  });

  return { setCursorPosition };
}
