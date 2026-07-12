import { inject } from "vue";
import { StdinContextKey } from "../context.ts";
import type { InternalInputRoutingRuntime } from "./input-route-runtime.ts";

/** Private packaged-fixture access while F3's public input API remains undecided. */
export function useInternalInputRoutingForTest(): InternalInputRoutingRuntime {
  const stdin = inject(StdinContextKey);
  if (!stdin) throw new Error("Internal input routing requires a vue-tui render tree");
  return stdin.internal_inputRouting;
}
