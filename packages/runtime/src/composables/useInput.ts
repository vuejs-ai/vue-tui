import {
  inject,
  onScopeDispose,
  toValue,
  unref,
  watch,
  type MaybeRef,
  type MaybeRefOrGetter,
} from "vue";
import { StdinContextKey } from "../context.ts";
import type { NormalizedInputFact } from "../io/normalized-input.ts";
import {
  normalizeInputHandlerResult,
  projectPublicInputEvent,
  type InputHandler,
} from "../io/public-input.ts";
import type { InternalInputApplicationGlobalRegistration } from "../io/input-route-runtime.ts";

export interface UseInputOptions {
  readonly isActive?: MaybeRefOrGetter<boolean>;
}

export function useInput(handler: MaybeRef<InputHandler>, options: UseInputOptions = {}): void {
  const stdin = inject(StdinContextKey);
  if (!stdin) throw new Error("useInput() must be called inside a vue-tui render tree");

  let desiredActive = false;
  let attached = false;
  let registration: InternalInputApplicationGlobalRegistration | undefined;
  let reconciling = false;
  let reconcileRequested = false;

  function listener(fact: NormalizedInputFact) {
    const event = projectPublicInputEvent(fact);
    if (!event) return normalizeInputHandlerResult("continue");
    return normalizeInputHandlerResult(unref(handler)(event));
  }

  function reconcileAttachment() {
    if (reconciling) {
      reconcileRequested = true;
      return;
    }
    reconciling = true;
    let firstError: unknown;
    let hasError = false;
    try {
      while (true) {
        reconcileRequested = false;
        try {
          if (desiredActive && !attached) {
            registration = stdin!.internal_inputRouting.registerApplicationGlobal({
              id: "useInput",
              handle: listener,
            });
            attached = true;
          } else if (!desiredActive && attached) {
            attached = false;
            registration?.end();
            registration = undefined;
          }
        } catch (error) {
          if (hasError) break;
          firstError = error;
          hasError = true;
          if (!reconcileRequested) break;
        }
        if (!reconcileRequested && desiredActive === attached) break;
      }
    } finally {
      reconciling = false;
    }
    if (hasError) throw firstError;
  }

  const isActive = options.isActive ?? true;
  watch(
    () => toValue(isActive),
    (value) => {
      desiredActive = value;
      reconcileAttachment();
    },
    { immediate: true, flush: "sync" },
  );

  onScopeDispose(() => {
    desiredActive = false;
    reconcileAttachment();
  });
}
