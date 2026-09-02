import type { TuiBox, TuiStatic, TuiText } from "../host/nodes.ts";
import { attachYoga, detachYoga } from "./yoga.ts";

export type HostYogaNode = TuiBox | TuiText | TuiStatic;

/** Layout-owned lifetime for every Yoga-bearing Vue host. */
export interface HostYogaLifecycle {
  attach(node: HostYogaNode, onDetach?: () => void): void;
  detach(node: HostYogaNode): void;
}

export interface HostYogaAllocationLedger extends HostYogaLifecycle {
  rollback(): void;
}

interface HostYogaLifetimeObserver {
  allocated(node: HostYogaNode, dispose: () => void): void;
  released(node: HostYogaNode): void;
}

/**
 * Keep Yoga allocation, idempotent disposal, and the render-local callback in
 * `layout/`. The callback may retire a Vue display bridge, but it never needs
 * to expose that bridge or the engine handle outside this boundary.
 */
export function createHostYogaLifecycle(observer?: HostYogaLifetimeObserver): HostYogaLifecycle {
  const disposedHosts = new WeakSet<HostYogaNode>();
  const detachCallbacks = new WeakMap<HostYogaNode, () => void>();

  const detach = (node: HostYogaNode): void => {
    if (disposedHosts.has(node)) return;
    disposedHosts.add(node);
    const onDetach = detachCallbacks.get(node);
    detachCallbacks.delete(node);
    observer?.released(node);
    try {
      onDetach?.();
    } finally {
      detachYoga(node);
    }
  };

  return {
    attach(node, onDetach): void {
      attachYoga(node);
      if (onDetach) detachCallbacks.set(node, onDetach);
      observer?.allocated(node, () => detach(node));
    },
    detach,
  };
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
  const allocationOrder: HostYogaNode[] = [];
  const pending = new Map<HostYogaNode, () => void>();
  const lifecycle = createHostYogaLifecycle({
    allocated(node, dispose): void {
      allocationOrder.push(node);
      pending.set(node, dispose);
    },
    released(node): void {
      pending.delete(node);
    },
  });

  return {
    ...lifecycle,
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
