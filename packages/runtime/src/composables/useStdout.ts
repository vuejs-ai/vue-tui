import { inject } from "vue";
import { AppContextKey } from "../context.ts";

export function useStdout(): { stdout: NodeJS.WriteStream; write: (data: string) => void } {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useStdout() must be called inside a vue-tui render tree");
  return { stdout: ctx.stdout, write: (data) => ctx.writeToStdout(data) };
}
