import { inject, onScopeDispose, unref, type MaybeRef } from "vue";
import { InternalFocusControllerKey } from "../focus/focus-context.ts";
import type { InternalFocusTargetHandle } from "../focus/focus-controller.ts";
import type { InternalNormalizedInputSource } from "../io/input-route-policy.ts";
import { projectPublicInputEvent, type TuiInputEvent } from "../io/public-input.ts";
import type { UseFocusReturn } from "./useFocus.ts";

export interface ExternalInputSource {
  readonly event: TuiInputEvent;
  readonly sequence: string;
  readonly fidelity: "normalized-utf8-sequence";
}

export type ExternalInputHandler = (source: ExternalInputSource) => void;

function readHandler(handler: MaybeRef<ExternalInputHandler>): ExternalInputHandler {
  const value: unknown = unref(handler);
  if (typeof value !== "function") {
    throw new TypeError("useExternalInput() handler must resolve to a function");
  }
  return value as ExternalInputHandler;
}

export function useExternalInput(
  target: UseFocusReturn,
  handler: MaybeRef<ExternalInputHandler>,
): void {
  const controller = inject(InternalFocusControllerKey, null);
  if (!controller) {
    throw new Error("useExternalInput() must be called inside a vue-tui render tree");
  }
  readHandler(handler);
  const receive = (source: InternalNormalizedInputSource): void => {
    const event = projectPublicInputEvent(source.fact);
    if (!event) return;
    readHandler(handler)(
      Object.freeze({
        event,
        sequence: source.sequence,
        fidelity: source.fidelity,
      }),
    );
  };
  const unregister = controller.registerExternal(target as InternalFocusTargetHandle, receive);
  onScopeDispose(unregister);
}
