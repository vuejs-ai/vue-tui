import { hasInjectionContext, inject, shallowRef, type ShallowRef } from "vue";
import { AppContextKey } from "../context.ts";
import type { TuiBox } from "../host/nodes.ts";
import { useRenderedTargetRegistration } from "../rendered-target.ts";
import { tryOnScopeDispose } from "../composables/scope.ts";
import { getInternalGeometryService, type InternalBoxSizeState } from "./geometry-service.ts";

export function useInternalBoxSize(
  resolveTarget: () => TuiBox | null,
  observe?: (state: InternalBoxSizeState, target: TuiBox | null) => void,
): Readonly<ShallowRef<InternalBoxSizeState>> {
  const app = hasInjectionContext() ? inject(AppContextKey, null) : null;
  const service = app ? getInternalGeometryService(app) : undefined;
  if (!app || !service) {
    const state = shallowRef<InternalBoxSizeState>(
      Object.freeze({ status: "unavailable" as const }),
    );
    observe?.(state.value, null);
    return state;
  }

  const binding = service.createBinding();
  const stopObserving = observe ? binding.observe(observe) : undefined;
  useRenderedTargetRegistration(resolveTarget, (node) =>
    node.type === "tui-box" ? binding.attach(node) : undefined,
  );
  tryOnScopeDispose(() => {
    binding.dispose();
    stopObserving?.();
  });
  return binding.state;
}
