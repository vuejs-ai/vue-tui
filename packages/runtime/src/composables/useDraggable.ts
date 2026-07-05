import {
  inject,
  nextTick,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";
import { AppContextKey } from "../context.ts";
import type { MouseTarget, TuiMouseEvent } from "../mouse/events.ts";

export interface UseDraggableOptions {
  onStart?: (event: TuiMouseEvent) => void;
  onMove?: (event: TuiMouseEvent) => void;
  onEnd?: (event: TuiMouseEvent) => void;
}

export interface UseDraggableReturn {
  readonly x: Readonly<Ref<number>>;
  readonly y: Readonly<Ref<number>>;
  readonly isDragging: Readonly<Ref<boolean>>;
}

export function useDraggable(
  target: MaybeRefOrGetter<MouseTarget | null>,
  options: UseDraggableOptions = {},
): UseDraggableReturn {
  const app = inject(AppContextKey);
  if (!app) throw new Error("useDraggable() must be called inside a vue-tui render tree");

  const x = shallowRef(0);
  const y = shallowRef(0);
  const isDragging = shallowRef(false);
  let unregister: (() => void) | undefined;

  function clearRegistration() {
    unregister?.();
    unregister = undefined;
    isDragging.value = false;
  }

  watch(
    () => toValue(target),
    (value, _oldValue, onCleanup) => {
      clearRegistration();
      if (!value) return;

      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
        clearRegistration();
      });

      void nextTick(() => {
        if (cancelled) return;
        unregister = app.internal_mouse?.registerDraggable(value, {
          onStart(event) {
            x.value = event.screenX;
            y.value = event.screenY;
            isDragging.value = true;
            options.onStart?.(event);
          },
          onMove(event) {
            x.value = event.screenX;
            y.value = event.screenY;
            options.onMove?.(event);
          },
          onEnd(event) {
            x.value = event.screenX;
            y.value = event.screenY;
            isDragging.value = false;
            options.onEnd?.(event);
          },
        });
      });
    },
    { immediate: true, flush: "post" },
  );

  onScopeDispose(clearRegistration);

  return { x, y, isDragging };
}
