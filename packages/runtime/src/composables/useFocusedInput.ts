import { inject, onScopeDispose, unref, type MaybeRef } from "vue";
import { InternalFocusControllerKey } from "../focus/focus-context.ts";
import type { InternalFocusTargetHandle } from "../focus/focus-controller.ts";
import type { NormalizedInputFact } from "../io/normalized-input.ts";
import {
  normalizeInputHandlerResult,
  projectPublicInputEvent,
  type InputHandler,
} from "../io/public-input.ts";
import type { UseFocusReturn } from "./useFocus.ts";

function readHandler(handler: MaybeRef<InputHandler>): InputHandler {
  const value: unknown = unref(handler);
  if (typeof value !== "function") {
    throw new TypeError("useFocusedInput() handler must resolve to a function");
  }
  return value as InputHandler;
}

export function useFocusedInput(target: UseFocusReturn, handler: MaybeRef<InputHandler>): void {
  const controller = inject(InternalFocusControllerKey, null);
  if (!controller) {
    throw new Error("useFocusedInput() must be called inside a vue-tui render tree");
  }
  readHandler(handler);
  const listener = (fact: NormalizedInputFact) => {
    const event = projectPublicInputEvent(fact);
    if (!event) return normalizeInputHandlerResult("continue");
    return normalizeInputHandlerResult(readHandler(handler)(event));
  };
  const unregister = controller.registerTargetInput(target as InternalFocusTargetHandle, listener);
  onScopeDispose(unregister);
}
