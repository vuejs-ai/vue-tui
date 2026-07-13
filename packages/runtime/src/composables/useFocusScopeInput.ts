import { inject, onScopeDispose, unref, type MaybeRef } from "vue";
import { InternalFocusControllerKey } from "../focus/focus-context.ts";
import type { InternalFocusScopeHandle } from "../focus/focus-controller.ts";
import type { NormalizedInputFact } from "../io/normalized-input.ts";
import {
  normalizeInputHandlerResult,
  projectPublicInputEvent,
  type InputHandler,
} from "../io/public-input.ts";
import type { UseFocusScopeReturn } from "./useFocusScope.ts";

function readHandler(handler: MaybeRef<InputHandler>): InputHandler {
  const value: unknown = unref(handler);
  if (typeof value !== "function") {
    throw new TypeError("useFocusScopeInput() handler must resolve to a function");
  }
  return value as InputHandler;
}

export function useFocusScopeInput(
  scope: UseFocusScopeReturn,
  handler: MaybeRef<InputHandler>,
): void {
  const controller = inject(InternalFocusControllerKey, null);
  if (!controller) {
    throw new Error("useFocusScopeInput() must be called inside a vue-tui render tree");
  }
  readHandler(handler);
  const listener = (fact: NormalizedInputFact) => {
    const event = projectPublicInputEvent(fact);
    if (!event) return normalizeInputHandlerResult("continue");
    return normalizeInputHandlerResult(readHandler(handler)(event));
  };
  const unregister = controller.registerScopeInput(scope as InternalFocusScopeHandle, listener);
  onScopeDispose(unregister);
}
