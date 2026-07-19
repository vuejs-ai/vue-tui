import { computed, type Ref } from "vue";
import type { PublicBoxInstance } from "../components/public-box.ts";
import {
  getInternalBoxPresenceService,
  type InternalBoxPresenceBinding,
} from "../box-presence/box-presence-service.ts";
import { useRenderedTargetRegistration } from "../rendered-target.ts";
import { tryOnScopeDispose } from "./scope.ts";
import { useDirectBoxTarget } from "./direct-box-target.ts";

const ABSENT = computed(() => false);

/** Whether one direct Box belongs to the last accepted live renderer tree. */
export function useBoxPresence<T extends PublicBoxInstance>(
  target: Readonly<Ref<T | null | undefined>>,
): Readonly<Ref<boolean>> {
  const { app, resolve } = useDirectBoxTarget("useBoxPresence", target);
  const service = getInternalBoxPresenceService(app);

  // String rendering deliberately has no live accepted-tree service. Reuse one
  // immutable false ref while the shared target validator still checks refs.
  if (!service) return ABSENT;

  let binding: InternalBoxPresenceBinding | undefined;
  try {
    binding = service.createBinding();
    useRenderedTargetRegistration(resolve, (node) => {
      if (node.type !== "tui-box") return;
      return binding!.attach(node);
    });
  } catch (error) {
    binding?.dispose();
    throw error;
  }
  tryOnScopeDispose(() => binding?.dispose());
  return binding.presence;
}
