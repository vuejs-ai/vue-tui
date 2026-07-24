import { inject } from "vue";
import { AppContextKey } from "../context.ts";
import type { CoordinatedWriteResult } from "../io/output-coordinator.ts";

/** Repository-only bridge for exercising Runtime's coordinated stdout mechanism. */
export interface UseStdoutReturn {
  /** Raw stream; writes through it bypass frame coordination and output sanitization. */
  readonly stdout: NodeJS.WriteStream;
  /** Commit geometry-safe styled lines and report acceptance or output flow control. */
  readonly write: (data: string) => CoordinatedWriteResult;
}

export function useStdout(): UseStdoutReturn {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useStdout() must be called inside a vue-tui render tree");
  return { stdout: ctx.stdout, write: (data) => ctx.writeToStdout(data) };
}
