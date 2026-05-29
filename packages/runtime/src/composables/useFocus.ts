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
  autoFocus?: boolean;
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
  let rawModeAcquired = false;

  function acquireRaw() {
    // Guard on isRawModeSupported before acquiring — mirrors Ink's use-focus.ts
    // (`if (!isRawModeSupported || !isActive) return;`). acquireRawMode() throws
    // on an unsupported stdin (see render.ts), so without this guard useFocus
    // would throw on a non-TTY. Focus should degrade to a no-op there instead.
    if (!rawModeAcquired && stdin?.isRawModeSupported) {
      stdin.acquireRawMode();
      rawModeAcquired = true;
    }
  }

  function releaseRaw() {
    if (rawModeAcquired && stdin) {
      stdin.releaseRawMode();
      rawModeAcquired = false;
    }
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

  const register = (id: string) => {
    unsubscribe = ctx.subscribe(id, (v) => {
      isFocused.value = v;
    });
    ctx.add(id, { autoFocus: options.autoFocus });
    currentId = id;
    // Apply the current active state to the freshly-registered id.
    if (toValue(isActive)) {
      ctx.activate(id);
      acquireRaw();
    } else {
      ctx.deactivate(id);
    }
  };

  watch(
    () => toValue(options.id) ?? fallbackId,
    (id) => {
      unregister();
      isFocused.value = false;
      register(id);
    },
    { immediate: true, flush: "sync" },
  );

  // Subsequent isActive toggles (register() applies the initial active state).
  watch(
    () => toValue(isActive),
    (active) => {
      if (currentId === undefined) return;
      if (active) {
        ctx.activate(currentId);
        acquireRaw();
      } else {
        ctx.deactivate(currentId);
        releaseRaw();
      }
    },
    { flush: "sync" },
  );

  onScopeDispose(() => {
    unregister();
    releaseRaw();
  });

  return { isFocused, focus: ctx.focus };
}
