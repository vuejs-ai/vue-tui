import type { ShallowRef } from "vue";
import type { AppContext } from "../context.ts";
import type { TuiNode } from "../host/nodes.ts";
import type { MouseDragHandler, MouseEventHandler, TuiMouseEventMap } from "./public-events.ts";

/** Private registration seam between the public composables and the app-local controller. */
export interface FullscreenMouseController {
  registerEvent<Type extends keyof TuiMouseEventMap>(
    target: TuiNode,
    type: Type,
    getHandler: () => MouseEventHandler<Type>,
  ): () => void;
  registerDrag(
    target: TuiNode,
    getHandler: () => MouseDragHandler,
    isDragging: ShallowRef<boolean>,
  ): () => void;
}

const controllersByApp = new WeakMap<AppContext, FullscreenMouseController>();

export function setFullscreenMouseController(
  app: AppContext,
  controller: FullscreenMouseController | null,
): void {
  if (controller) controllersByApp.set(app, controller);
  else controllersByApp.delete(app);
}

export function getFullscreenMouseController(
  app: AppContext,
): FullscreenMouseController | undefined {
  return controllersByApp.get(app);
}
