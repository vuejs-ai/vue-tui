import { inject } from "vue";
import { AppContextKey } from "../context.ts";

/** The public stderr surface returned by {@link useStderr}. Mirrors Ink's `useStderr()`. */
export interface UseStderrReturn {
  readonly stderr: NodeJS.WriteStream;
  readonly write: (data: string) => void;
}

export function useStderr(): UseStderrReturn {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useStderr() must be called inside a vue-tui render tree");
  return { stderr: ctx.stderr, write: (data) => ctx.writeToStderr(data) };
}
