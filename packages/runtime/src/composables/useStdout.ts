import { inject } from "vue";
import { AppContextKey } from "../context.ts";

/** Coordinated styled-line output plus the deliberately raw stdout escape hatch. */
export interface UseStdoutReturn {
  /** Raw stream; writes through it bypass frame coordination and output sanitization. */
  readonly stdout: NodeJS.WriteStream;
  /** Commit geometry-safe styled lines without corrupting the active live region. */
  readonly write: (data: string) => void;
}

export function useStdout(): UseStdoutReturn {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useStdout() must be called inside a vue-tui render tree");
  return { stdout: ctx.stdout, write: (data) => ctx.writeToStdout(data) };
}
