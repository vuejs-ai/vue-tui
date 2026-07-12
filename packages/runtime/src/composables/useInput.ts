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
    // Ctrl+C exit (both the legacy \x03 byte and the kitty CSI-u form) is
    // handled once, upstream in the stdin controller, so when
    // exitOnCtrlC is on Ctrl+C never reaches here — and useInput forwards every
    // key it does receive. Keeping the exit in one always-on place is what makes
    // it fire for useFocus/usePaste-only apps too; don't re-add a copy here.
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
