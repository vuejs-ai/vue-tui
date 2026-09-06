import { inject } from "vue";
import { AppContextKey, type CoordinatedWriteResult } from "../context.ts";

/** Repository-only bridge for exercising Runtime's coordinated stderr mechanism. */
export interface UseStderrReturn {
  /** Commit geometry-safe styled lines and report acceptance or output flow control. */
  readonly write: (data: string) => CoordinatedWriteResult;
}

export function useStderr(): UseStderrReturn {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useStderr() must be called inside a vue-tui render tree");
  return { write: (data) => ctx.writeToStderr(data) };
}
