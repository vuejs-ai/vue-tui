import { inject } from "vue";
import { AppContextKey } from "../context.ts";

export function useStderr(): { stderr: NodeJS.WriteStream; write: (data: string) => void } {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useStderr() must be called inside a vue-tui render tree");
  return { stderr: ctx.stderr, write: (data) => ctx.stderr.write(data) };
}
