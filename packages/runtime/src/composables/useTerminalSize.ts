import { inject, onScopeDispose, shallowRef, type ShallowRef } from "vue";
import terminalSize from "terminal-size";
import { AppContextKey } from "../context.ts";

/**
 * A terminal's character-cell dimensions. Mirrors Ink's `WindowSize` exactly
 * (`columns`/`rows`, not `width`/`height`).
 *
 * Note the Vue-vs-React shape: Ink's `useWindowSize()` returns a `WindowSize`
 * snapshot, whereas vue-tui's `useWindowSize()` / `useTerminalSize()` return
 * reactive **refs** of these dimensions
 * (`{ columns: ShallowRef<number>; rows: ShallowRef<number> }`). The data shape
 * is the same; the reactivity wrapper is the framework difference.
 */
export interface WindowSize {
  readonly columns: number;
  readonly rows: number;
}

/**
 * Resolve terminal dimensions with a fallback chain:
 * 1. stdout.columns / stdout.rows (available in TTY mode)
 * 2. terminal-size package (works even when stdout is redirected)
 * 3. Hardcoded defaults (80x24)
 */
export function resolveSize(stdout: NodeJS.WriteStream): WindowSize {
  const cols = stdout.columns;
  const rowsVal = stdout.rows;
  if (cols && rowsVal) return { columns: cols, rows: rowsVal };

  // stdout doesn't report dimensions — use terminal-size as fallback
  const fallback = terminalSize();
  return {
    columns: cols || fallback.columns || 80,
    rows: rowsVal || fallback.rows || 24,
  };
}

export function useTerminalSize(): { columns: ShallowRef<number>; rows: ShallowRef<number> } {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useTerminalSize() must be called inside a vue-tui render tree");
  const initial = resolveSize(ctx.stdout);
  const columns = shallowRef(initial.columns);
  const rows = shallowRef(initial.rows);
  function onResize() {
    const size = resolveSize(ctx!.stdout);
    columns.value = size.columns;
    rows.value = size.rows;
  }
  ctx.stdout.on("resize", onResize);
  onScopeDispose(() => ctx.stdout.off("resize", onResize));
  return { columns, rows };
}

/** Alias for `useTerminalSize`. */
export const useWindowSize = useTerminalSize;
