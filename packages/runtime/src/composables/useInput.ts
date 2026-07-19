import { inject, isRef, onScopeDispose, toValue, watch, type MaybeRefOrGetter } from "vue";
import { AppContextKey, StdinContextKey } from "../context.ts";
import { isErrorInput, messageForNonError } from "../error-value.ts";
import type { NormalizedInputFact } from "../io/normalized-input.ts";
import {
  normalizeInputHandlerResult,
  projectPublicInputEvent,
  type TuiInputEvent,
} from "../io/public-input.ts";
import type { InternalInputApplicationGlobalRegistration } from "../io/input-route-runtime.ts";

function validateHandler(
  handler: unknown,
): asserts handler is (event: TuiInputEvent) => void | { readonly preventDefault: true } {
  if (typeof handler !== "function") {
    throw new TypeError("useInput() handler must be a function");
  }
}

function validateOptions(
  options: unknown,
): asserts options is { readonly isActive?: MaybeRefOrGetter<boolean> } | undefined {
  if (options === undefined) return;
  if (
    typeof options !== "object" ||
    options === null ||
    Object.getPrototypeOf(options) !== Object.prototype
  ) {
    throw new TypeError("useInput() options must be a plain object");
  }
  const keys = Reflect.ownKeys(options);
  if (keys.some((key) => key !== "isActive")) {
    throw new TypeError('useInput() options only supports the "isActive" property');
  }
}

function readIsActive(source: MaybeRefOrGetter<boolean>): boolean {
  const value: unknown = toValue(source);
  if (typeof value !== "boolean") {
    throw new TypeError("useInput() isActive must resolve to a boolean");
  }
  return value;
}

export function useInput(
  handler: (event: TuiInputEvent) => void | { readonly preventDefault: true },
  options?: { readonly isActive?: MaybeRefOrGetter<boolean> },
): void {
  validateHandler(handler);
  validateOptions(options);
  const app = inject(AppContextKey);
  const stdin = inject(StdinContextKey);
  if (!app || !stdin) throw new Error("useInput() must be called inside a vue-tui render tree");
  const application = app;

  let desiredActive = false;
  let attached = false;
  let registration: InternalInputApplicationGlobalRegistration | undefined;
  let reconciling = false;
  let reconcileRequested = false;

  function listener(fact: NormalizedInputFact) {
    try {
      const event = projectPublicInputEvent(fact);
      if (!event) return normalizeInputHandlerResult(undefined);
      return normalizeInputHandlerResult(handler(event));
    } catch (error) {
      const fatalError = isErrorInput(error) ? error : new Error(messageForNonError(error));
      application.exit(fatalError);
      throw fatalError;
    }
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

  const isActive = options?.isActive === undefined ? true : options.isActive;
  // Register cleanup before the immediate watcher can activate managed input.
  // Vue clears the current setup scope while handling a synchronous watcher
  // failure, so registering afterward would itself warn and write to stderr on
  // an expected unavailable-input exit.
  onScopeDispose(() => {
    desiredActive = false;
    reconcileAttachment();
  });

  if (typeof isActive !== "function" && !isRef(isActive)) {
    desiredActive = readIsActive(isActive);
    reconcileAttachment();
    return;
  }

  watch(
    () => {
      try {
        return { ok: true, value: readIsActive(isActive) } as const;
      } catch (error) {
        return { ok: false, error } as const;
      }
    },
    (resolution) => {
      if (!resolution.ok) {
        desiredActive = false;
        try {
          reconcileAttachment();
        } finally {
          app.exit(
            isErrorInput(resolution.error)
              ? resolution.error
              : new Error(messageForNonError(resolution.error)),
          );
        }
        return;
      }
      desiredActive = resolution.value;
      reconcileAttachment();
    },
    { immediate: true, flush: "sync" },
  );
}
