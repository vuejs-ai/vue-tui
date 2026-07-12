import { inject, type Ref } from "vue";
import { StdinContextKey } from "../context.ts";
import type { InputAvailability } from "../io/input-availability.ts";

export interface UseInputAvailabilityReturn {
  readonly availability: Readonly<Ref<InputAvailability>>;
}

/** Return the stable mount-time capability of vue-tui's managed semantic input. */
export function useInputAvailability(): UseInputAvailabilityReturn {
  const stdin = inject(StdinContextKey);
  if (!stdin) {
    throw new Error("useInputAvailability() must be called inside a vue-tui render tree");
  }
  return Object.freeze({ availability: stdin.inputAvailability });
}
