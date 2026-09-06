import { hasInjectionContext, inject, shallowRef, type ShallowRef } from "vue";
import { AppContextKey, InternalGeometryServiceKey } from "./context.ts";
import type { TuiBox } from "../host/nodes.ts";
import { tryOnScopeDispose } from "./composables/scope.ts";
import type { InternalBoxSizeState } from "../session/geometry-service.ts";
import { useRenderedTargetRegistration } from "./rendered-target.ts";

export function useInternalBoxSize(
  resolveTarget: () => TuiBox | null,
  observe?: (state: InternalBoxSizeState, target: TuiBox | null) => void,
): Readonly<ShallowRef<InternalBoxSizeState>> {
  const app = hasInjectionContext() ? inject(AppContextKey, null) : null;
  const service = hasInjectionContext() ? inject(InternalGeometryServiceKey, null) : null;
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
