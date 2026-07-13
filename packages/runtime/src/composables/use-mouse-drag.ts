import {
  hasInjectionContext,
  inject,
  readonly,
  shallowRef,
  toValue,
  unref,
  watch,
  type MaybeRef,
  type ShallowRef,
} from "vue";
import { AppContextKey, type AppContext } from "../context.ts";
import { resolveTuiNode } from "../host/resolve-node.ts";
import { getFullscreenMouseController } from "../mouse/context.ts";
import type {
  MouseDragHandler,
  UseMouseDragOptions,
  UseMouseDragReturn,
} from "../mouse/public-events.ts";
import { useInternalRenderSession } from "../render-session.ts";
import { useRenderedTargetRegistration } from "../rendered-target.ts";
import type { ElementTarget } from "./useElementGeometry.ts";

function requireAppContext(): AppContext {
  const app = hasInjectionContext() ? inject(AppContextKey, null) : null;
  if (!app) throw new Error("useMouseDrag() must be called inside a vue-tui render tree");
  return app;
}

function isEnabled(options: UseMouseDragOptions | undefined): boolean {
  return options?.isActive === undefined || toValue(options.isActive);
}

function guardInline(options: UseMouseDragOptions | undefined): void {
  const fail = (): never => {
    throw new Error("useMouseDrag() requires an effective visual Fullscreen render surface");
  };
  if (isEnabled(options)) fail();
  watch(
    () => isEnabled(options),
    (active) => {
      if (active) fail();
    },
    { flush: "sync" },
  );
}

export function useMouseDrag(
  target: ElementTarget,
  handler: MaybeRef<MouseDragHandler>,
  options?: UseMouseDragOptions,
): UseMouseDragReturn {
  const app = requireAppContext();
  const session = useInternalRenderSession().session;
  const isDragging = shallowRef(false);
  const result = Object.freeze({
    isDragging: readonly(isDragging) as Readonly<ShallowRef<boolean>>,
  });

  if (
    session.host === "live" &&
    session.output.presentation === "visual" &&
    session.mode.effective === "inline"
  ) {
    guardInline(options);
    return result;
  }

  if (
    session.host !== "live" ||
    session.output.presentation !== "visual" ||
    !session.capabilities.elementHitTesting
  ) {
    return result;
  }

  useRenderedTargetRegistration(
    () => (isEnabled(options) ? resolveTuiNode(toValue(target)) : null),
    (node) => {
      const controller = getFullscreenMouseController(app);
      if (!controller) throw new Error("Fullscreen mouse controller is unavailable");
      return controller.registerDrag(node, () => unref(handler) as MouseDragHandler, isDragging);
    },
  );

  return result;
}
