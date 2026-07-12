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

export interface UsePasteOptions {
  isActive?: MaybeRefOrGetter<boolean>;
}

type PasteHandler = (text: string) => void;

export function usePaste(handler: MaybeRef<PasteHandler>, options: UsePasteOptions = {}): void {
  const stdin = inject(StdinContextKey);
  if (!stdin) throw new Error("usePaste() must be called inside a vue-tui render tree");

  let desiredActive = false;
  let attached = false;
  let reconciling = false;
  let reconcileRequested = false;

  function listener(text: string) {
    unref(handler)(text);
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
            let pasteEnabled = false;
            try {
              stdin!.acquireRawMode();
              rawAcquired = true;
              stdin!.setBracketedPasteMode(true);
              pasteEnabled = true;
              stdin!.internal_eventEmitter.on("paste", listener);
              attached = true;
              rawAcquired = false;
              pasteEnabled = false;
            } catch (error) {
              // Acquisition is transactional. A terminal-mode restore can itself
              // throw, but it must not prevent the independent raw-mode lease
              // from being released; preserve the original acquisition error.
              if (pasteEnabled) {
                try {
                  stdin!.setBracketedPasteMode(false);
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
            stdin!.internal_eventEmitter.off("paste", listener);
            let releaseError: unknown;
            let releaseFailed = false;
            try {
              stdin!.setBracketedPasteMode(false);
            } catch (error) {
              releaseError = error;
              releaseFailed = true;
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

  onScopeDispose(() => {
    desiredActive = false;
    reconcileAttachment();
  });
}
