import { inject } from "vue";
import { StdinContextKey } from "../context.ts";

/** The raw stdin escape hatch returned by {@link useStdin}. */
export interface UseStdinReturn {
  /**
   * The actual stdin stream selected for the current mount. Bytes read from this raw
   * escape hatch have no vue-tui event semantics and are not guaranteed to compose
   * safely with framework-managed input routing.
   */
  readonly stdin: NodeJS.ReadStream;
}

export function useStdin(): UseStdinReturn {
  const ctx = inject(StdinContextKey);
  if (!ctx) throw new Error("useStdin() must be called inside a vue-tui render tree");
  // Do not return the internal context under a narrower TypeScript annotation.
  // JavaScript consumers can inspect object fields, and the framework's raw-mode,
  // protocol, and routing operations are intentionally not public escape hatches.
  return Object.freeze({ stdin: ctx.stdin });
}
