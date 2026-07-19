import {
  hasInjectionContext,
  inject,
  shallowRef,
  toValue,
  type MaybeRefOrGetter,
  type ShallowRef,
} from "vue";
import { AppContextKey } from "../context.ts";
import type { TuiNode } from "../host/nodes.ts";
import { resolveTuiNode } from "../host/resolve-node.ts";
import { useRenderedTargetRegistration } from "../rendered-target.ts";
import { tryOnScopeDispose } from "../composables/scope.ts";
import { getInternalGeometryService, type InternalElementGeometry } from "./geometry-service.ts";

/** Private accepted-paint adapter shared by Runtime measurement, caret, and pointer behavior. */
export function useInternalElementGeometry(
  target: MaybeRefOrGetter<unknown>,
  observe?: (geometry: InternalElementGeometry, target: TuiNode | null) => void,
): Readonly<ShallowRef<InternalElementGeometry>> {
  const app = hasInjectionContext() ? inject(AppContextKey, null) : null;
  const service = app ? getInternalGeometryService(app) : undefined;
  if (!app) {
    const geometry = shallowRef<InternalElementGeometry>(Object.freeze({ status: "unavailable" }));
    observe?.(geometry.value, null);
    return geometry;
  }

  const resolveTarget = (): TuiNode | null => resolveTuiNode(toValue(target));

  if (!service) {
    const geometry = shallowRef<InternalElementGeometry>(Object.freeze({ status: "unavailable" }));
    observe?.(geometry.value, null);
    return geometry;
  }

  const binding = service.createBinding();
  let stopObserving: (() => void) | undefined;
  if (observe) stopObserving = binding.observe(observe);
  useRenderedTargetRegistration(resolveTarget, (node) => binding.attach(node));
  tryOnScopeDispose(() => {
    binding.dispose();
    stopObserving?.();
  });
  return binding.geometry;
}
