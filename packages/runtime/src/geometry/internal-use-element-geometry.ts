import {
  hasInjectionContext,
  inject,
  shallowRef,
  toValue,
  type MaybeRefOrGetter,
  type ShallowRef,
} from "vue";
import { AppContextKey } from "../context.ts";
import { resolveTuiNode } from "../host/resolve-node.ts";
import { useRenderedTargetRegistration } from "../rendered-target.ts";
import { tryOnScopeDispose } from "../composables/scope.ts";
import { getInternalGeometryService, type InternalElementGeometry } from "./geometry-service.ts";

/** Private F2/F5 adapter shared by public geometry and the later caret registry. */
export function useInternalElementGeometry(
  target: MaybeRefOrGetter<unknown>,
  observe?: (geometry: InternalElementGeometry) => void,
): Readonly<ShallowRef<InternalElementGeometry>> {
  const app = hasInjectionContext() ? inject(AppContextKey, null) : null;
  const service = app ? getInternalGeometryService(app) : undefined;
  if (!service) {
    const geometry = shallowRef<InternalElementGeometry>(Object.freeze({ status: "unavailable" }));
    observe?.(geometry.value);
    return geometry;
  }

  const binding = service.createBinding();
  let stopObserving: (() => void) | undefined;
  if (observe) stopObserving = binding.observe(observe);
  useRenderedTargetRegistration(
    () => resolveTuiNode(toValue(target)),
    (node) => binding.attach(node),
  );
  tryOnScopeDispose(() => {
    binding.dispose();
    stopObserving?.();
  });
  return binding.geometry;
}
