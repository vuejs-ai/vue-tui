import { inject, toValue, unref, watch, type MaybeRef, type MaybeRefOrGetter } from "vue";
import { StdinContextKey } from "../context.ts";
import type { MouseInputEvent } from "../io/parse-mouse.ts";
import { tryOnScopeDispose } from "./scope.ts";

export type { MouseInputEvent } from "../io/parse-mouse.ts";

export interface UseMouseInputOptions {
  isActive?: MaybeRefOrGetter<boolean>;
}

type MouseInputHandler = (event: MouseInputEvent) => void;

export function useMouseInput(
  handler: MaybeRef<MouseInputHandler>,
  options: UseMouseInputOptions = {},
): void {
  const stdin = inject(StdinContextKey);
  if (!stdin) throw new Error("useMouseInput() must be called inside a vue-tui render tree");

  let desiredActive = false;
  let attached = false;
  let mouseModeToken: symbol | undefined;
  let reconciling = false;
  let reconcileRequested = false;

  function listener(event: MouseInputEvent) {
    unref(handler)(event);
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
            let rawAcquired = false;
            let acquiredMouseToken: symbol | undefined;
            try {
              stdin!.acquireRawMode();
              rawAcquired = true;
              acquiredMouseToken = stdin!.acquireSgrMouseMode("button");
              stdin!.internal_eventEmitter.on("mouse", listener);
              mouseModeToken = acquiredMouseToken;
              attached = true;
              rawAcquired = false;
              acquiredMouseToken = undefined;
            } catch (error) {
              if (acquiredMouseToken) {
                try {
                  stdin!.releaseSgrMouseMode(acquiredMouseToken);
                } catch {}
              }
              if (rawAcquired) {
                try {
                  stdin!.releaseRawMode();
                } catch {}
              }
              throw error;
            }
          } else if (!desiredActive && attached) {
            attached = false;
            stdin!.internal_eventEmitter.off("mouse", listener);
            let releaseError: unknown;
            let releaseFailed = false;
            if (mouseModeToken) {
              try {
                stdin!.releaseSgrMouseMode(mouseModeToken);
              } catch (error) {
                releaseError = error;
                releaseFailed = true;
              }
              mouseModeToken = undefined;
            }
            try {
              stdin!.releaseRawMode();
            } catch (error) {
              if (!releaseFailed) releaseError = error;
              releaseFailed = true;
            }
            if (releaseFailed) throw releaseError;
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

  tryOnScopeDispose(() => {
    desiredActive = false;
    reconcileAttachment();
  });
}
