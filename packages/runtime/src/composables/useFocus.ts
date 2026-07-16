import {
  inject,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type ShallowRef,
} from "vue";
import { FocusContextKey, StdinContextKey } from "../context.ts";

let nextAutoId = 0;

export interface UseFocusOptions {
  autoFocus?: MaybeRefOrGetter<boolean>;
  isActive?: MaybeRefOrGetter<boolean>;
  id?: MaybeRefOrGetter<string>;
}

export function useFocus(options: UseFocusOptions = {}): {
  isFocused: ShallowRef<boolean>;
  focus: (id: string) => void;
} {
  const ctx = inject(FocusContextKey);
  const stdin = inject(StdinContextKey);
  if (!ctx) throw new Error("useFocus() must be called inside a vue-tui render tree");

  // Stable fallback id used whenever no explicit id is given (mirrors Ink's
  // useMemo(() => customId ?? random, [customId]) — the random part is stable for
  // the component's life).
  const fallbackId = `__auto-${nextAutoId++}`;
  const isFocused = shallowRef(false);

  const isActive = options.isActive ?? true;
  let rawModeDesired = false;
  let rawModeAcquired = false;
  let reconcilingRawMode = false;
  let rawModeReconcileRequested = false;

  function reconcileRawMode() {
    if (reconcilingRawMode) {
      rawModeReconcileRequested = true;
      return;
    }
    reconcilingRawMode = true;
    let firstError: unknown;
    let hasError = false;
    try {
      while (true) {
        rawModeReconcileRequested = false;
        try {
          if (rawModeDesired && !rawModeAcquired) {
            stdin!.acquireRawMode();
            rawModeAcquired = true;
          } else if (!rawModeDesired && rawModeAcquired) {
            rawModeAcquired = false;
            stdin!.releaseRawMode();
          }
        } catch (error) {
          if (hasError) break;
          firstError = error;
          hasError = true;
          if (!rawModeReconcileRequested) break;
        }
        if (!rawModeReconcileRequested && rawModeDesired === rawModeAcquired) break;
      }
    } finally {
      reconcilingRawMode = false;
    }
    if (hasError) throw firstError;
  }

  function setRawModeDesired(desired: boolean) {
    // Guard on isRawModeSupported before acquiring — mirrors Ink's use-focus.ts
    // (`if (!isRawModeSupported || !isActive) return;`). acquireRawMode() throws
    // on an unsupported stdin (see render.ts), so without this guard useFocus
    // would throw on a non-TTY. Focus should degrade to a no-op there instead.
    rawModeDesired = desired && Boolean(stdin?.isRawModeSupported);
    reconcileRawMode();
  }

  // Track the current registration so an id change can unregister the old id and
  // re-register under the new one — Ink keys its add/remove effect on [id].
  let currentId: string | undefined;
  let unsubscribe: (() => void) | undefined;

  // Arrow functions (not hoisted declarations) so TS keeps the `ctx` non-null
  // narrowing from the guard above inside these closures.
  const unregister = () => {
    if (currentId === undefined) return;
    unsubscribe?.();
    unsubscribe = undefined;
    ctx.remove(currentId);
    currentId = undefined;
  };

  const register = (id: string, autoFocus: boolean) => {
    unsubscribe = ctx.subscribe(id, (v) => {
      isFocused.value = v;
    });
    ctx.add(id, { autoFocus });
    currentId = id;
    isFocused.value = ctx.activeId === id;
    // Apply the current active state to the freshly-registered id.
    if (toValue(isActive)) {
      ctx.activate(id);
      setRawModeDesired(true);
    } else {
      ctx.deactivate(id);
      setRawModeDesired(false);
    }
  };

  // Install this watcher before the immediate registration watcher below. Raw
  // acquisition can call a hostile stream synchronously; an isActive change
  // during that call must already be observable and reconciled.
  watch(
    () => toValue(isActive),
    (active) => {
      if (currentId === undefined) return;
      if (active) {
        ctx.activate(currentId);
        setRawModeDesired(true);
      } else {
        ctx.deactivate(currentId);
        setRawModeDesired(false);
      }
    },
    { flush: "sync" },
  );

  watch(
    () => [toValue(options.id) ?? fallbackId, toValue(options.autoFocus ?? false)] as const,
    ([id, autoFocus]) => {
      unregister();
      isFocused.value = false;
      register(id, autoFocus);
    },
    { immediate: true, flush: "sync" },
  );

  onScopeDispose(() => {
    unregister();
    setRawModeDesired(false);
  });

  return { isFocused, focus: ctx.focus };
}
