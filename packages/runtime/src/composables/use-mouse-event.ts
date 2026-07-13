import { hasInjectionContext, inject, toValue, unref, watch, type MaybeRef } from "vue";
import { AppContextKey, type AppContext } from "../context.ts";
import { resolveTuiNode } from "../host/resolve-node.ts";
import { getFullscreenMouseController } from "../mouse/context.ts";
import type {
  MouseEventHandler,
  TuiMouseEventMap,
  UseMouseEventOptions,
} from "../mouse/public-events.ts";
import { useInternalRenderSession } from "../render-session.ts";
import { useRenderedTargetRegistration } from "../rendered-target.ts";
import type { ElementTarget } from "./useElementGeometry.ts";

function requireAppContext(): AppContext {
  const app = hasInjectionContext() ? inject(AppContextKey, null) : null;
  if (!app) throw new Error("useMouseEvent() must be called inside a vue-tui render tree");
  return app;
}

function isEnabled(options: UseMouseEventOptions | undefined): boolean {
  return options?.isActive === undefined || toValue(options.isActive);
}

function guardInline(options: UseMouseEventOptions | undefined): void {
  const fail = (): never => {
    throw new Error("useMouseEvent() requires an effective visual Fullscreen render surface");
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

export function useMouseEvent<Type extends keyof TuiMouseEventMap>(
  target: ElementTarget,
  type: Type,
  handler: MaybeRef<MouseEventHandler<Type>>,
  options?: UseMouseEventOptions,
): void {
  const app = requireAppContext();
  const session = useInternalRenderSession().session;

  if (type !== "click" && type !== "wheel") {
    throw new TypeError('useMouseEvent() event type must be "click" or "wheel"');
  }

  if (
    session.host === "live" &&
    session.output.presentation === "visual" &&
    session.mode.effective === "inline"
  ) {
    guardInline(options);
    return;
  }

  if (
    session.host !== "live" ||
    session.output.presentation !== "visual" ||
    !session.capabilities.elementHitTesting
  ) {
    return;
  }

  useRenderedTargetRegistration(
    () => (isEnabled(options) ? resolveTuiNode(toValue(target)) : null),
    (node) => {
      const controller = getFullscreenMouseController(app);
      if (!controller) throw new Error("Fullscreen mouse controller is unavailable");
      return controller.registerEvent(node, type, () => unref(handler) as MouseEventHandler<Type>);
    },
  );
}
