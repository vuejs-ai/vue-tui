import { inject } from "vue";
import { StdinContextKey } from "../context.ts";
import type { InternalInputRoutingRuntime } from "./input-route-runtime.ts";

/** Private packaged-fixture access to the selected-path and external-owner route kept for F4. */
export function useInternalInputRoutingForTest(): InternalInputRoutingRuntime {
  const stdin = inject(StdinContextKey);
  if (!stdin) throw new Error("Internal input routing requires a vue-tui render tree");
  return stdin.internal_inputRouting;
}
