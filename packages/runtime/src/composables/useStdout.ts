import { inject } from "vue";
import { AppContextKey } from "../context.ts";

/** The public stdout surface returned by {@link useStdout}. Mirrors Ink's `useStdout()`. */
export interface UseStdoutReturn {
  readonly stdout: NodeJS.WriteStream;
  readonly write: (data: string) => void;
}

export function useStdout(): UseStdoutReturn {
  const ctx = inject(AppContextKey);
  if (!ctx) throw new Error("useStdout() must be called inside a vue-tui render tree");
  return { stdout: ctx.stdout, write: (data) => ctx.writeToStdout(data) };
}
