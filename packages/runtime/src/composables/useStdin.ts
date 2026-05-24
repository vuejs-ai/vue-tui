import { inject } from "vue";
import { StdinContextKey, type StdinContext } from "../context.ts";

export function useStdin(): StdinContext {
  const ctx = inject(StdinContextKey);
  if (!ctx) throw new Error("useStdin() must be called inside a vue-tui render tree");
  return ctx;
}
