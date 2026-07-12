import { inject } from "vue";
import { AppContextKey } from "../context.ts";

/** Coordinated styled-line output plus the deliberately raw stderr escape hatch. */
export interface UseStderrReturn {
  /** Raw stream; writes through it bypass frame coordination and output sanitization. */
  readonly stderr: NodeJS.WriteStream;
  /** Commit geometry-safe styled lines without corrupting the active live region. */
  readonly write: (data: string) => void;
}

export function useStderr(): UseStderrReturn {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useStderr() must be called inside a vue-tui render tree");
  return { stderr: ctx.stderr, write: (data) => ctx.writeToStderr(data) };
}
