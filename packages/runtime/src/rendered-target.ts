import { hasInjectionContext, inject, watch, type WatchStopHandle } from "vue";
import { AppContextKey, type AppContext } from "./context.ts";
import { findRootNode } from "./host/resolve-node.ts";
import { isContainer, type TuiNode, type TuiRoot } from "./host/nodes.ts";
import { tryOnScopeDispose } from "./composables/scope.ts";

export type RenderedTargetCleanup = () => void;
export type RenderedTargetAttach = (target: TuiNode) => RenderedTargetCleanup | undefined | void;

export interface RenderedTargetRegistration {
  reconcile(): void;
  dispose(): void;
}

export interface RenderedTargetController {
  register(resolve: () => TuiNode | null, attach: RenderedTargetAttach): RenderedTargetRegistration;
  reconcile(): void;
  invalidateSubtree(target: TuiNode): void;
  dispose(): void;
}

/**
 * Private owner transaction used by app-level behaviors that derive one
 * generation from the complete rendered-target set.
 */
export interface RenderedTargetTransactionHost {
  /** Delay derived publication until one complete attach/detach operation settles. */
  transaction(kind: "reconcile" | "cleanup", change: () => void): void;
  /**
   * Called after every matching registration is logically detached and before
   * any cleanup callback runs. A route owner can synchronously invalidate the
   * removed subtree so re-entrant application cleanup cannot observe stale state.
   */
  beforeInvalidateSubtree(target: TuiNode): void;
}

// AppContext is exported from the unsupported-but-packaged `/internal` entry.
// Keep this controller in a private side table so its generic target machinery
// cannot leak into AppContext's generated declaration surface.
const controllersByApp = new WeakMap<AppContext, RenderedTargetController>();

export function setRenderedTargetController(
  app: AppContext,
  controller: RenderedTargetController | null,
): void {
  if (controller) controllersByApp.set(app, controller);
  else controllersByApp.delete(app);
}

export function getRenderedTargetController(app: AppContext): RenderedTargetController | undefined {
  return controllersByApp.get(app);
}

interface MutableRegistration {
  readonly resolve: () => TuiNode | null;
  readonly attach: RenderedTargetAttach;
  active: boolean;
  target: TuiNode | null;
  cleanup: RenderedTargetCleanup | undefined;
}

function descendantsOf(target: TuiNode, out: WeakSet<TuiNode>): void {
  out.add(target);
  if (!isContainer(target)) return;
  for (const child of target.children) descendantsOf(child, out);
}

function throwFirst(errors: unknown[]): void {
  if (errors.length > 0) throw errors[0];
}

/**
 * Tracks renderer-owned registrations by resolved host-node identity.
 *
 * Vue component refs point at stable public instances, while their `$el` host
 * node can change independently. The renderer therefore reconciles this
 * controller after every commit instead of treating the author ref identity as
 * the registration identity. Host removal invalidates a subtree synchronously,
 * which also rejects stale non-null refs left by older Vue versions.
 */
export function createRenderedTargetController(
  root: TuiRoot,
  transactionHost?: RenderedTargetTransactionHost | readonly RenderedTargetTransactionHost[],
): RenderedTargetController {
  const transactionHosts = transactionHost
    ? Array.isArray(transactionHost)
      ? transactionHost
      : [transactionHost]
    : [];
  const registrations = new Set<MutableRegistration>();
  const invalidatedTargets = new WeakSet<TuiNode>();
  let disposed = false;
  let reconciling = false;
  let reconcileRequested = false;
  let transactionDepth = 0;

  const transaction = (kind: "reconcile" | "cleanup", change: () => void): void => {
    if (transactionHosts.length === 0 || transactionDepth > 0) {
      change();
      return;
    }
    transactionDepth++;
    try {
      let index = 0;
      const enterNext = (): void => {
        const host = transactionHosts[index++];
        if (host) host.transaction(kind, enterNext);
        else change();
      };
      enterNext();
    } finally {
      transactionDepth--;
    }
  };

  const takeCleanup = (registration: MutableRegistration): RenderedTargetCleanup | undefined => {
    const cleanup = registration.cleanup;
    registration.cleanup = undefined;
    registration.target = null;
    return cleanup;
  };

  const detach = (registration: MutableRegistration): void => {
    const cleanup = takeCleanup(registration);
    cleanup?.();
  };

  const resolveRenderedTarget = (registration: MutableRegistration): TuiNode | null => {
    const target = registration.resolve();
    if (!target || invalidatedTargets.has(target)) return null;
    return findRootNode(target) === root ? target : null;
  };

  const reconcileOne = (registration: MutableRegistration): void => {
    if (!registration.active) return;
    let nextTarget = resolveRenderedTarget(registration);
    if (registration.target === nextTarget) return;

    if (registration.target) detach(registration);
    if (!registration.active) return;

    // Cleanup is user-observable and can synchronously change the ref (for
    // example through a watcher of useDraggable().isDragging). Never attach the
    // target that was resolved before cleanup; establish the current identity
    // again after the old adapter is fully detached.
    nextTarget = resolveRenderedTarget(registration);
    if (!nextTarget) return;

    // Publish the identity before calling the adapter. If the adapter causes a
    // re-entrant invalidation, its returned disposer is run immediately below
    // rather than being installed on a target that is no longer current.
    registration.target = nextTarget;
    let cleanup: RenderedTargetCleanup | undefined;
    try {
      cleanup = registration.attach(nextTarget) || undefined;
    } catch (error) {
      registration.target = null;
      throw error;
    }
    if (!registration.active || registration.target !== nextTarget) {
      try {
        cleanup?.();
      } finally {
        if (registration.active) reconcileRequested = true;
      }
      return;
    }
    registration.cleanup = cleanup;

    // attach() can also synchronously retarget without going through this
    // controller's post-flush watcher. Release the now-stale adapter and ask the
    // outer reconciliation loop to converge on the latest resolved identity.
    if (resolveRenderedTarget(registration) !== nextTarget) {
      try {
        detach(registration);
      } finally {
        if (registration.active) reconcileRequested = true;
      }
    }
  };

  const reconcile = (): void => {
    if (disposed) return;
    if (reconciling) {
      reconcileRequested = true;
      return;
    }

    transaction("reconcile", () => {
      reconciling = true;
      const errors: unknown[] = [];
      try {
        do {
          reconcileRequested = false;
          for (const registration of Array.from(registrations)) {
            try {
              reconcileOne(registration);
            } catch (error) {
              errors.push(error);
            }
          }
        } while (reconcileRequested && !disposed);
      } finally {
        reconciling = false;
      }
      throwFirst(errors);
    });
  };

  return {
    register(resolve, attach) {
      if (disposed) throw new Error("rendered-target controller is disposed");
      const registration: MutableRegistration = {
        resolve,
        attach,
        active: true,
        target: null,
        cleanup: undefined,
      };
      registrations.add(registration);
      return {
        reconcile,
        dispose() {
          if (!registration.active) return;
          transaction("cleanup", () => {
            registration.active = false;
            registrations.delete(registration);
            detach(registration);
          });
        },
      };
    },
    reconcile,
    invalidateSubtree(target) {
      if (disposed) return;
      transaction("cleanup", () => {
        descendantsOf(target, invalidatedTargets);
        // Select and logically detach the whole batch before invoking any
        // disposer. A disposer can synchronously mutate another node's parent or
        // reconcile another registration; neither may let a target that belonged
        // to the removed subtree escape invalidation.
        const cleanups: RenderedTargetCleanup[] = [];
        for (const registration of Array.from(registrations)) {
          if (!registration.target || !invalidatedTargets.has(registration.target)) continue;
          const cleanup = takeCleanup(registration);
          if (cleanup) cleanups.push(cleanup);
        }
        const errors: unknown[] = [];
        for (const host of transactionHosts) {
          try {
            host.beforeInvalidateSubtree(target);
          } catch (error) {
            errors.push(error);
          }
        }
        for (const cleanup of cleanups) {
          try {
            cleanup();
          } catch (error) {
            errors.push(error);
          }
        }
        throwFirst(errors);
      });
    },
    dispose() {
      if (disposed) return;
      transaction("cleanup", () => {
        disposed = true;
        const cleanups: RenderedTargetCleanup[] = [];
        for (const registration of Array.from(registrations)) {
          registration.active = false;
          const cleanup = takeCleanup(registration);
          if (cleanup) cleanups.push(cleanup);
        }
        const errors: unknown[] = [];
        for (const cleanup of cleanups) {
          try {
            cleanup();
          } catch (error) {
            errors.push(error);
          }
        }
        registrations.clear();
        throwFirst(errors);
      });
    },
  };
}

/** Internal composable used by concrete ref-bound behaviors. */
export function useRenderedTargetRegistration(
  resolve: () => TuiNode | null,
  attach: RenderedTargetAttach,
): () => void {
  // Some ref-bound composables intentionally report an unavailable standalone
  // state. Avoid both Vue's inject-outside-setup warning and a hard dependency
  // on renderer context for those callers. Composables that require a render
  // tree validate their own context before reaching this internal helper.
  const app = hasInjectionContext() ? inject(AppContextKey, null) : null;
  const controller = app ? getRenderedTargetController(app) : undefined;
  if (!controller) return () => {};

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
  return dispose;
}
