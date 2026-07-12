import {
  inject,
  onScopeDispose,
  toValue,
  unref,
  watch,
  type MaybeRef,
  type MaybeRefOrGetter,
} from "vue";
import { AppContextKey, StdinContextKey } from "../context.ts";
import { getLegacyInputProjection, type NormalizedInputFact } from "../io/normalized-input.ts";

export interface Key {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  pageDown: boolean;
  pageUp: boolean;
  home: boolean;
  end: boolean;
  return: boolean;
  escape: boolean;
  ctrl: boolean;
  shift: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  meta: boolean;
  super: boolean;
  hyper: boolean;
  capsLock: boolean;
  numLock: boolean;
  eventType?: "press" | "repeat" | "release";
}

export interface UseInputOptions {
  isActive?: MaybeRefOrGetter<boolean>;
}

type InputHandler = (input: string, key: Key) => void;

export function useInput(handler: MaybeRef<InputHandler>, options: UseInputOptions = {}): void {
  const app = inject(AppContextKey);
  const stdin = inject(StdinContextKey);
  if (!app || !stdin) throw new Error("useInput() must be called inside a vue-tui render tree");

  let desiredActive = false;
  let attached = false;
  let detachInputRoute: (() => void) | undefined;
  let reconciling = false;
  let reconcileRequested = false;

  function listener(fact: NormalizedInputFact) {
    const projection = getLegacyInputProjection(fact);
    if (!projection) return;
    // Ctrl+C exit (both the legacy \x03 byte and the Kitty CSI-u form) is a
    // delayed controller default. Compatibility handlers observe the fact
    // first; the controller then exits unless a future semantic route prevents
    // defaults. Any managed input demand keeps this controller route active, so
    // useFocus/usePaste-only apps get the same default without a useInput hook.
    // An input-free app stays cooked and leaves Ctrl+C signal handling to the OS.
    // The normalized fact and cached projection are shared, but the current
    // public Key type is mutable and historically supplied one object per
    // listener. Keep that edge isolation until F3 selects the public surface.
    unref(handler)(projection.input, { ...projection.key });
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
            try {
              stdin!.acquireRawMode();
              rawAcquired = true;
              detachInputRoute = stdin!.internal_routes.attach("input", listener);
              attached = true;
              rawAcquired = false;
            } catch (error) {
              if (rawAcquired) stdin!.releaseRawMode();
              throw error;
            }
          } else if (!desiredActive && attached) {
            attached = false;
            detachInputRoute?.();
            detachInputRoute = undefined;
            stdin!.releaseRawMode();
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
