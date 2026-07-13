import { inject } from "vue";
import { StdinContextKey } from "../context.ts";
import type { InternalInputRoutingRuntime } from "./input-route-runtime.ts";

/** Private packaged-fixture access retained for F3 protocol and PTY fallthrough evidence. */
export function useInternalInputRoutingForTest(): InternalInputRoutingRuntime {
  const stdin = inject(StdinContextKey);
  if (!stdin) throw new Error("Internal input routing requires a vue-tui render tree");
  return stdin.internal_inputRouting;
}
