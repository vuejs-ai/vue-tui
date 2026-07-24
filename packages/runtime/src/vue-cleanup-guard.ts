import { ErrorCodes, handleError, isVNode, type ComponentInternalInstance, type VNode } from "vue";

interface VueTeardownEffect {
  cleanup?: () => unknown;
  onStop?: () => unknown;
}

interface VueTeardownScope {
  effects?: VueTeardownEffect[];
  cleanups?: Array<() => unknown>;
  scopes?: VueTeardownScope[];
  stop(fromParent?: boolean): void;
}

type VueTeardownComponentInstance = ComponentInternalInstance & {
  scope?: VueTeardownScope;
  subTree?: VNode;
};

type VueTeardownVNode = VNode & {
  component?: VueTeardownComponentInstance | null;
  ssContent?: VNode;
  ssFallback?: VNode;
  suspense?: {
    activeBranch?: VNode;
    pendingBranch?: VNode;
  };
};

export interface VueCleanupGuard {
  /** Guard every effect-scope cleanup reachable from this rendered VNode. */
  guardVNode(root: VNode, onError: (error: unknown) => void): void;
  /**
   * Guard only the rendered children of one exact host node. Component VNodes
   * may share their root host's `el`, so matching the string host VNode avoids
   * guarding the owner component that remains mounted.
   */
  guardHostChildren(
    root: VNode,
    host: object,
    onError: (error: unknown) => void,
  ): VueCleanupErrorOwner | null;
}

export interface VueCleanupErrorOwner {
  /** Re-enter Vue's ordinary ancestor capture and application error-handler chain. */
  report(error: unknown): void;
}

/**
 * Vue's EffectScope.stop() invokes effect and scope cleanups directly. One
 * throwing cleanup can therefore abort the component-unmount traversal after
 * Vue has marked the scope inactive, leaving descendant scopes unreachable on
 * retry. This per-render guard gives every cleanup one isolated turn and lets
 * the owning render boundary report captured failures after traversal.
 */
export function createVueCleanupGuard(): VueCleanupGuard {
  const guardedCallbacks = new WeakSet<() => unknown>();
  const guardedScopes = new WeakSet<object>();

  const guardCallback = (
    callback: () => unknown,
    onError: (error: unknown) => void,
  ): (() => unknown) => {
    if (guardedCallbacks.has(callback)) return callback;
    const guarded = () => {
      try {
        return callback();
      } catch (error) {
        onError(error);
      }
    };
    // Mark only the wrapper. If one callback was deliberately registered in
    // two cleanup slots, each slot still receives its own invocation.
    guardedCallbacks.add(guarded);
    return guarded;
  };

  const guardScopeOperations = (
    scope: VueTeardownScope,
    onError: (error: unknown) => void,
  ): void => {
    for (const effect of scope.effects ?? []) {
      if (effect.cleanup) effect.cleanup = guardCallback(effect.cleanup, onError);
      if (effect.onStop) effect.onStop = guardCallback(effect.onStop, onError);
    }
    const cleanups = scope.cleanups ?? [];
    for (let index = 0; index < cleanups.length; index++) {
      cleanups[index] = guardCallback(cleanups[index]!, onError);
    }
    for (const childScope of scope.scopes ?? []) guardScope(childScope, onError);
  };

  const guardScope = (scope: VueTeardownScope, onError: (error: unknown) => void): void => {
    if (guardedScopes.has(scope)) return;
    guardedScopes.add(scope);
    const originalStop = scope.stop.bind(scope);
    scope.stop = function stopGuardedVueScope(fromParent?: boolean): void {
      // Run immediately before Vue stops the scope so a before-unmount hook
      // that registered another cleanup is included too.
      guardScopeOperations(scope, onError);
      originalStop(fromParent);
    };
    for (const childScope of scope.scopes ?? []) guardScope(childScope, onError);
  };

  const guardVNode = (root: VNode, onError: (error: unknown) => void): void => {
    const visitedVNodes = new Set<VNode>();
    const visitedInstances = new Set<VueTeardownComponentInstance>();

    const visitValue = (value: unknown): void => {
      if (isVNode(value)) {
        visitVNode(value);
        return;
      }
      if (Array.isArray(value)) {
        for (const child of value) visitValue(child);
      }
    };
    const visitVNode = (vnode: VNode): void => {
      if (visitedVNodes.has(vnode)) return;
      visitedVNodes.add(vnode);
      const teardownVNode = vnode as VueTeardownVNode;
      const instance = teardownVNode.component;
      if (instance && !visitedInstances.has(instance)) {
        visitedInstances.add(instance);
        if (instance.scope) guardScope(instance.scope, onError);
        if (instance.subTree) visitVNode(instance.subTree);
      }
      visitValue(vnode.children);
      if (teardownVNode.ssContent) visitVNode(teardownVNode.ssContent);
      if (teardownVNode.ssFallback) visitVNode(teardownVNode.ssFallback);
      if (teardownVNode.suspense?.activeBranch) {
        visitVNode(teardownVNode.suspense.activeBranch);
      }
      if (teardownVNode.suspense?.pendingBranch) {
        visitVNode(teardownVNode.suspense.pendingBranch);
      }
    };

    visitVNode(root);
  };

  const guardHostChildren = (
    root: VNode,
    host: object,
    onError: (error: unknown) => void,
  ): VueCleanupErrorOwner | null => {
    const visitedVNodes = new Set<VNode>();
    let owner: VueTeardownComponentInstance | null = null;

    const visitValue = (
      value: unknown,
      closestOwner: VueTeardownComponentInstance | null,
    ): void => {
      if (owner) return;
      if (isVNode(value)) {
        visitVNode(value, closestOwner);
        return;
      }
      if (Array.isArray(value)) {
        for (const child of value) visitValue(child, closestOwner);
      }
    };
    const visitVNode = (vnode: VNode, closestOwner: VueTeardownComponentInstance | null): void => {
      if (owner || visitedVNodes.has(vnode)) return;
      visitedVNodes.add(vnode);
      if (typeof vnode.type === "string" && vnode.el === host) {
        owner = closestOwner;
        const children = vnode.children;
        if (isVNode(children)) {
          guardVNode(children, onError);
        } else if (Array.isArray(children)) {
          for (const child of children) {
            if (isVNode(child)) guardVNode(child, onError);
          }
        }
        return;
      }

      const teardownVNode = vnode as VueTeardownVNode;
      const component = teardownVNode.component;
      if (component?.subTree) visitVNode(component.subTree, component);
      visitValue(vnode.children, closestOwner);
      if (teardownVNode.ssContent) visitVNode(teardownVNode.ssContent, closestOwner);
      if (teardownVNode.ssFallback) visitVNode(teardownVNode.ssFallback, closestOwner);
      if (teardownVNode.suspense?.activeBranch) {
        visitVNode(teardownVNode.suspense.activeBranch, closestOwner);
      }
      if (teardownVNode.suspense?.pendingBranch) {
        visitVNode(teardownVNode.suspense.pendingBranch, closestOwner);
      }
    };

    visitVNode(root, null);
    return owner
      ? {
          report(error) {
            handleError(error, owner, ErrorCodes.COMPONENT_UPDATE);
          },
        }
      : null;
  };

  return { guardVNode, guardHostChildren };
}
