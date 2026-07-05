import { watchPostEffect, type Ref } from "vue";
import { resolveTuiNode } from "../host/resolve-node.ts";
import { bindMouseTarget, createDetachedMouseTarget } from "../mouse/target.ts";
import type { MouseTarget } from "../mouse/events.ts";

export function useMouseTarget(hostRef: Ref<unknown>): MouseTarget {
  const target = createDetachedMouseTarget();

  watchPostEffect(() => {
    const node = resolveTuiNode(hostRef.value);
    if (node) bindMouseTarget(target, node);
  });

  return target;
}
