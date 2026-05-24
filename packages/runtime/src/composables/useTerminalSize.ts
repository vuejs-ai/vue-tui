import { inject, onScopeDispose, shallowRef, type ShallowRef } from "vue";
import { AppContextKey } from "../context.ts";

export function useTerminalSize(): { columns: ShallowRef<number>; rows: ShallowRef<number> } {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useTerminalSize() must be called inside a vue-tui render tree");
  const columns = shallowRef(ctx.stdout.columns ?? 80);
  const rows = shallowRef(ctx.stdout.rows ?? 24);
  function onResize() {
    columns.value = ctx!.stdout.columns ?? 80;
    rows.value = ctx!.stdout.rows ?? 24;
  }
  ctx.stdout.on("resize", onResize);
  onScopeDispose(() => ctx.stdout.off("resize", onResize));
  return { columns, rows };
}
