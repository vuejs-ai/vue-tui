import type { TuiNode } from "./nodes.ts";
import type { TtyRendererOptions } from "./node-ops.ts";

export interface HostYogaAllocationLedger {
  readonly lifetime: NonNullable<TtyRendererOptions["hostYogaLifetime"]>;
  rollback(): void;
}

/**
 * Track Yoga-bearing hosts from allocation until normal host removal.
 *
 * Vue can abort an initial patch after creating a host but before attaching it
 * to the root. Such a host is unreachable from ordinary tree traversal, so a
 * renderer-local ledger releases every still-owned allocation in reverse
 * creation order during rollback.
 */
export function createHostYogaAllocationLedger(): HostYogaAllocationLedger {
  const allocationOrder: TuiNode[] = [];
  const pending = new Map<TuiNode, () => void>();
  const lifetime: HostYogaAllocationLedger["lifetime"] = {
    allocated(node, dispose): void {
      allocationOrder.push(node);
      pending.set(node, dispose);
    },
    released(node): void {
      pending.delete(node);
    },
  };

  return {
    lifetime,
    rollback(): void {
      for (let index = allocationOrder.length - 1; index >= 0; index--) {
        const node = allocationOrder[index]!;
        const dispose = pending.get(node);
        if (!dispose) continue;
        pending.delete(node);
        try {
          dispose();
        } catch {
          // Continue through every independent allocation. Cleanup must not
          // replace the component, renderer, or terminal failure in flight.
        }
      }
      allocationOrder.length = 0;
    },
  };
}
