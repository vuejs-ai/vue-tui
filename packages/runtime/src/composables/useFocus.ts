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
  id?: string;
}

export function useFocus(options: UseFocusOptions = {}): {
  isFocused: ShallowRef<boolean>;
  focus: (id: string) => void;
} {
  const ctx = inject(FocusContextKey);
  const stdin = inject(StdinContextKey);
  if (!ctx) throw new Error("useFocus() must be called inside a vue-tui render tree");

  const id = options.id ?? `__auto-${nextAutoId++}`;
  const isFocused = shallowRef(false);

  const unsubscribe = ctx.subscribe(id, (v) => {
    isFocused.value = v;
  });

  ctx.add(id, { autoFocus: options.autoFocus });

  const isActive = options.isActive ?? true;
  let rawModeAcquired = false;

  function acquireRaw() {
    if (!rawModeAcquired && stdin) {
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

  watch(
    () => toValue(isActive),
    (active) => {
      if (active) {
        ctx.activate(id);
        acquireRaw();
      } else {
        ctx.deactivate(id);
        releaseRaw();
      }
    },
    { immediate: true, flush: "sync" },
  );

  onScopeDispose(() => {
    unsubscribe();
    ctx.remove(id);
    releaseRaw();
  });

  return { isFocused, focus: ctx.focus };
}
