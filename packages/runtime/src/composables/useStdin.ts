import { inject } from "vue";
import { StdinContextKey } from "../context.ts";

/**
 * The public stdin surface returned by {@link useStdin}. Mirrors Ink's `useStdin()`,
 * which returns its `PublicProps` — not the full context. The raw-mode ref-counting
 * primitives and the typed input-route plumbing on the internal `StdinContext` are
 * reached by the framework's own composables (`useInput` / `useFocus` / `usePaste`) via
 * `inject(StdinContextKey)`, and are deliberately not part of this public surface.
 */
export interface UseStdinReturn {
  /**
   * The actual stdin stream selected for the current mount. Bytes read from this raw
   * escape hatch have no vue-tui event semantics and are not guaranteed to compose
   * safely with framework-managed input routing.
   */
  readonly stdin: NodeJS.ReadStream;
  readonly setRawMode: (mode: boolean) => void;
  /**
   * Whether the mounted stdin is a TTY that is already raw or exposes the
   * operation needed to enter raw mode. A later host operation can still fail.
   */
  readonly isRawModeSupported: boolean;
}

export function useStdin(): UseStdinReturn {
  const ctx = inject(StdinContextKey);
  if (!ctx) throw new Error("useStdin() must be called inside a vue-tui render tree");
  // Return the full controller narrowed to the public surface — TS structural typing
  // hides the internal members, exactly as Ink types `useStdin()` as `PublicProps`.
  return ctx;
}
