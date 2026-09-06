import { hasInjectionContext, inject, watch, type WatchStopHandle } from "vue";
import { RenderedTargetControllerKey } from "./context.ts";
import type { TuiNode } from "../host/nodes.ts";
import type {
  RenderedTargetAttach,
  RenderedTargetRegistrationControl,
} from "../session/rendered-target.ts";
import { tryOnScopeDispose } from "./composables/scope.ts";

/** Internal composable used by concrete ref-bound behaviors. */
export function useRenderedTargetRegistrationControl(
  resolve: () => TuiNode | null,
  attach: RenderedTargetAttach,
): RenderedTargetRegistrationControl {
  // Some ref-bound composables intentionally report an unavailable standalone
  // state. Avoid both Vue's inject-outside-setup warning and a hard dependency
  // on renderer context for those callers. Composables that require a render
  // tree validate their own context before reaching this internal helper.
  const controller = hasInjectionContext() ? inject(RenderedTargetControllerKey, null) : null;
  if (!controller) return { reconcile() {}, dispose() {} };

  const registration = controller.register(resolve, attach);
  let stop: WatchStopHandle | undefined;
  try {
    stop = watch(resolve, () => registration.reconcile(), { flush: "post", immediate: true });
  } catch (error) {
    registration.dispose();
    throw error;
  }
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stop?.();
    registration.dispose();
  };
  tryOnScopeDispose(dispose);
  return { reconcile: () => registration.reconcile(), dispose };
}

/** Internal composable used by concrete ref-bound behaviors. */
export function useRenderedTargetRegistration(
  resolve: () => TuiNode | null,
  attach: RenderedTargetAttach,
): () => void {
  const control = useRenderedTargetRegistrationControl(resolve, attach);
  return () => control.dispose();
}
