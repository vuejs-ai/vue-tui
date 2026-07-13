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

/** Private F5 adapter. The public composable is introduced only after this service is proven. */
export function useInternalElementGeometry(
  target: MaybeRefOrGetter<unknown>,
): Readonly<ShallowRef<InternalElementGeometry>> {
  const app = hasInjectionContext() ? inject(AppContextKey, null) : null;
  const service = app ? getInternalGeometryService(app) : undefined;
  if (!service) {
    return shallowRef<InternalElementGeometry>(Object.freeze({ status: "unavailable" }));
  }

  const binding = service.createBinding();
  useRenderedTargetRegistration(
    () => resolveTuiNode(toValue(target)),
    (node) => binding.attach(node),
  );
  tryOnScopeDispose(() => binding.dispose());
  return binding.geometry;
}
