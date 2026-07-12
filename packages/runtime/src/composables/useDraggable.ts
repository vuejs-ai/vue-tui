import {
  computed,
  inject,
  shallowRef,
  toValue,
  type ComponentPublicInstance,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";
import { AppContextKey } from "../context.ts";
import { resolveTuiNode } from "../host/resolve-node.ts";
import type { TuiMouseEvent } from "../mouse/events.ts";
import { useRenderedTargetRegistration } from "../rendered-target.ts";

export interface UseDraggablePosition {
  readonly x: number;
  readonly y: number;
}

export type UseDraggableAxis = "x" | "y" | "both";
export type UseDraggableTarget = MaybeRefOrGetter<ComponentPublicInstance | null | undefined>;

export interface UseDraggableOptions {
  initialValue?: UseDraggablePosition;
  axis?: UseDraggableAxis;
  onStart?: (position: UseDraggablePosition, event: TuiMouseEvent) => void;
  onMove?: (position: UseDraggablePosition, event: TuiMouseEvent) => void;
  onEnd?: (position: UseDraggablePosition, event: TuiMouseEvent) => void;
}

export interface UseDraggableReturn {
  readonly x: Ref<number>;
  readonly y: Ref<number>;
  readonly position: Readonly<Ref<UseDraggablePosition>>;
  readonly isDragging: Readonly<Ref<boolean>>;
}

export function useDraggable(
  target: UseDraggableTarget,
  options: UseDraggableOptions = {},
): UseDraggableReturn {
  const app = inject(AppContextKey);
  if (!app) throw new Error("useDraggable() must be called inside a vue-tui render tree");

  const x = shallowRef(options.initialValue?.x ?? 0);
  const y = shallowRef(options.initialValue?.y ?? 0);
  const position = computed(() => ({ x: x.value, y: y.value }));
  const isDragging = shallowRef(false);
  const axis = options.axis ?? "both";
  let startPosition: UseDraggablePosition = { x: x.value, y: y.value };
  let startPointer: UseDraggablePosition = { x: 0, y: 0 };

  function updatePosition(event: TuiMouseEvent) {
    const nextX = startPosition.x + event.screenX - startPointer.x;
    const nextY = startPosition.y + event.screenY - startPointer.y;
    if (axis !== "y") x.value = nextX;
    if (axis !== "x") y.value = nextY;
  }

  useRenderedTargetRegistration(
    () => resolveTuiNode(toValue(target)),
    (node) => {
      const unregister = app.internal_mouse?.registerDraggable(node, {
        onStart(event) {
          const result = options.onStart?.(position.value, event) as unknown;
          if (result === false) return false;
          startPosition = { x: x.value, y: y.value };
          startPointer = { x: event.screenX, y: event.screenY };
          isDragging.value = true;
        },
        onMove(event) {
          updatePosition(event);
          options.onMove?.(position.value, event);
        },
        onEnd(event) {
          updatePosition(event);
          isDragging.value = false;
          options.onEnd?.(position.value, event);
        },
      });
      return () => {
        unregister?.();
        isDragging.value = false;
      };
    },
  );

  return { x, y, position, isDragging };
}
