/**
 * Private, API-neutral F4 focus policy experiment.
 *
 * The handles below deliberately do not model public composable names or Vue
 * refs. F2 will supply rendered attachment and F3 will consume `route()`. This
 * model exists to make focus ownership, traversal, traps, and restoration
 * executable before the public authoring surface is selected.
 */

export interface InternalFocusScope {
  readonly debugLabel: string;
}

export interface InternalFocusTarget {
  readonly debugLabel: string;
}

const focusCheckpointState: unique symbol = Symbol("vue-tui.internal.focus-checkpoint");

/** Opaque rollback point for one accepted private focus-policy generation. */
export interface InternalFocusCheckpoint {
  readonly [focusCheckpointState]: FocusPolicyCheckpointState;
}

export interface InternalFocusRoute {
  readonly boundary: InternalFocusScope;
  readonly owner: InternalFocusTarget | null;
  readonly ancestors: readonly InternalFocusScope[];
  readonly externalOwner: InternalFocusTarget | null;
}

export interface InternalFocusInputSignature {
  readonly rendered: readonly InternalFocusTarget[];
  readonly sequential: readonly InternalFocusTarget[];
}

export interface InternalFocusPolicy {
  readonly rootScope: InternalFocusScope;
  readonly current: InternalFocusTarget | null;
  checkpoint(): InternalFocusCheckpoint;
  restore(checkpoint: InternalFocusCheckpoint): void;
  createScope(options: {
    readonly debugLabel: string;
    readonly parent?: InternalFocusScope;
    readonly active?: boolean;
    readonly trapped?: boolean;
  }): InternalFocusScope;
  updateScope(
    scope: InternalFocusScope,
    update: { readonly active?: boolean; readonly trapped?: boolean },
  ): void;
  removeScope(scope: InternalFocusScope): void;
  createTarget(options: {
    readonly debugLabel: string;
    readonly scope?: InternalFocusScope;
    readonly disabled?: boolean;
    readonly hidden?: boolean;
    readonly tabIndex?: 0 | -1;
    readonly autoFocus?: boolean;
    readonly externalOwner?: boolean;
  }): InternalFocusTarget;
  updateTarget(
    target: InternalFocusTarget,
    update: {
      readonly disabled?: boolean;
      readonly hidden?: boolean;
      readonly tabIndex?: 0 | -1;
      readonly autoFocus?: boolean;
      readonly externalOwner?: boolean;
    },
  ): void;
  removeTarget(target: InternalFocusTarget): void;
  /** Replace the authoritative rendered-host preorder in one reconciliation. */
  setRenderedOrder(targets: readonly InternalFocusTarget[]): void;
  /** Group related Vue state changes into one focus and route reconciliation. */
  batch(change: () => void): void;
  focus(target: InternalFocusTarget): boolean;
  /** Blur the exact target, or the current/pending target when omitted. */
  blur(target?: InternalFocusTarget): boolean;
  focusNext(): boolean;
  focusPrevious(): boolean;
  /** Exact host-derived inputs used by the Tab traversal default. */
  inputSignature(): InternalFocusInputSignature;
  route(): InternalFocusRoute;
}

interface ScopeState {
  readonly handle: InternalFocusScope;
  readonly parent: ScopeState | null;
  active: boolean;
  trapped: boolean;
  removed: boolean;
  activation: number;
  remembered: TargetState | null;
  restoreAnchor: TargetState | null;
}

interface TargetState {
  readonly handle: InternalFocusTarget;
  readonly scope: ScopeState;
  disabled: boolean;
  hidden: boolean;
  tabIndex: 0 | -1;
  autoFocus: boolean;
  autoFocusConsumed: boolean;
  externalOwner: boolean;
  removed: boolean;
  fallbackOrder: readonly TargetState[] | null;
}

interface ScopeCheckpoint {
  readonly state: ScopeState;
  readonly active: boolean;
  readonly trapped: boolean;
  readonly removed: boolean;
  readonly activation: number;
  readonly remembered: TargetState | null;
  readonly restoreAnchor: TargetState | null;
}

interface TargetCheckpoint {
  readonly state: TargetState;
  readonly disabled: boolean;
  readonly hidden: boolean;
  readonly tabIndex: 0 | -1;
  readonly autoFocus: boolean;
  readonly autoFocusConsumed: boolean;
  readonly externalOwner: boolean;
  readonly removed: boolean;
  readonly fallbackOrder: readonly TargetState[] | null;
}

interface FocusPolicyCheckpointState {
  readonly owner: symbol;
  readonly activation: number;
  readonly scopes: readonly ScopeCheckpoint[];
  readonly targets: readonly TargetCheckpoint[];
  readonly rendered: readonly TargetState[];
  readonly focused: TargetState | null;
  readonly boundary: ScopeState;
  readonly pendingRestore: TargetState | null;
  readonly preferredActivatedScope: ScopeState | null;
}

const rootLabel = "<root-focus-scope>";

export function createInternalFocusPolicy(): InternalFocusPolicy {
  const checkpointOwner = Symbol("vue-tui:focus-policy");
  const scopeStates = new Map<InternalFocusScope, ScopeState>();
  const targetStates = new Map<InternalFocusTarget, TargetState>();
  let activation = 0;
  const rootHandle = Object.freeze({ debugLabel: rootLabel });
  const root: ScopeState = {
    handle: rootHandle,
    parent: null,
    active: true,
    trapped: false,
    removed: false,
    activation: ++activation,
    remembered: null,
    restoreAnchor: null,
  };
  scopeStates.set(rootHandle, root);

  let rendered: TargetState[] = [];
  let focused: TargetState | null = null;
  let boundary: ScopeState = root;
  let pendingRestore: TargetState | null = null;
  let preferredActivatedScope: ScopeState | null = root;
  let batchDepth = 0;
  let reconciliationPending = false;
  let publishedCurrent: TargetState | null = null;
  let publishedRoute: InternalFocusRoute = Object.freeze({
    boundary: root.handle,
    owner: null,
    ancestors: Object.freeze([]),
    externalOwner: null,
  });

  const stateForScope = (handle: InternalFocusScope): ScopeState => {
    const state = scopeStates.get(handle);
    if (!state || state.removed) throw new Error("Unknown or removed internal focus scope");
    return state;
  };

  const stateForTarget = (handle: InternalFocusTarget): TargetState => {
    const state = targetStates.get(handle);
    if (!state || state.removed) throw new Error("Unknown or removed internal focus target");
    return state;
  };

  const isScopeUsable = (scope: ScopeState): boolean => {
    for (let current: ScopeState | null = scope; current; current = current.parent) {
      if (current.removed || !current.active) return false;
    }
    return true;
  };

  const isWithin = (scope: ScopeState, ancestor: ScopeState): boolean => {
    for (let current: ScopeState | null = scope; current; current = current.parent) {
      if (current === ancestor) return true;
    }
    return false;
  };

  const resolveBoundary = (): ScopeState => {
    let result = root;
    for (const scope of scopeStates.values()) {
      if (
        !scope.removed &&
        scope.trapped &&
        isScopeUsable(scope) &&
        scope.activation > result.activation
      ) {
        result = scope;
      }
    }
    return result;
  };

  const isRendered = (target: TargetState): boolean => rendered.includes(target);
  const isEligible = (target: TargetState, within: ScopeState): boolean =>
    !target.removed &&
    isRendered(target) &&
    !target.hidden &&
    !target.disabled &&
    isScopeUsable(target.scope) &&
    isWithin(target.scope, within);

  const sequentialTargets = (within: ScopeState): TargetState[] =>
    rendered.filter((target) => target.tabIndex === 0 && isEligible(target, within));

  const remember = (target: TargetState, within: ScopeState): void => {
    for (let scope: ScopeState | null = target.scope; scope; scope = scope.parent) {
      scope.remembered = target;
      // A trapped boundary preserves the focus memory outside it. Closing the
      // boundary can therefore restore the previous branch without a component
      // reconstructing a stack.
      if (scope === within) break;
    }
  };

  const select = (target: TargetState, within: ScopeState): void => {
    if (preferredActivatedScope && isWithin(preferredActivatedScope, within)) {
      preferredActivatedScope = null;
    }
    focused = target;
    pendingRestore = null;
    if (target.autoFocus) target.autoFocusConsumed = true;
    remember(target, within);
  };

  const consumeAutoFocus = (
    within: ScopeState,
    scope: ScopeState | null = null,
  ): TargetState | null => {
    const candidates = rendered.filter(
      (target) =>
        target.autoFocus &&
        !target.autoFocusConsumed &&
        (!scope || isWithin(target.scope, scope)) &&
        isEligible(target, within),
    );
    for (const candidate of candidates) candidate.autoFocusConsumed = true;
    return candidates[0] ?? null;
  };

  const preferredTarget = (scope: ScopeState, within: ScopeState): TargetState | null => {
    const remembered =
      scope.remembered && isEligible(scope.remembered, within) ? scope.remembered : null;
    const auto = consumeAutoFocus(within, scope);
    if (remembered) return remembered;
    if (auto) return auto;
    if (scope.trapped) {
      return (
        rendered.find(
          (target) =>
            target.tabIndex === 0 && isWithin(target.scope, scope) && isEligible(target, within),
        ) ?? null
      );
    }
    return null;
  };

  const removalFallback = (target: TargetState, within: ScopeState): TargetState | null => {
    const previousOrder = target.fallbackOrder ?? rendered;
    const previousIndex = previousOrder.indexOf(target);
    const isSequentialCandidate = (candidate: TargetState): boolean =>
      candidate.tabIndex === 0 && isEligible(candidate, within);
    if (previousIndex >= 0) {
      for (let index = previousIndex + 1; index < previousOrder.length; index++) {
        const candidate = previousOrder[index]!;
        if (isSequentialCandidate(candidate)) return candidate;
      }
      for (let index = previousIndex - 1; index >= 0; index--) {
        const candidate = previousOrder[index]!;
        if (isSequentialCandidate(candidate)) return candidate;
      }
    }
    return null;
  };

  const clearMemories = (target: TargetState): void => {
    for (const scope of scopeStates.values()) {
      if (scope.remembered === target) scope.remembered = null;
    }
    if (pendingRestore === target) pendingRestore = null;
  };

  const publish = (): void => {
    const owner = focused;
    const ancestors: InternalFocusScope[] = [];
    if (owner) {
      for (
        let scope: ScopeState | null = owner.scope;
        scope && scope !== root;
        scope = scope.parent
      ) {
        if (scope === boundary) break;
        ancestors.push(scope.handle);
      }
    }
    publishedCurrent = owner;
    publishedRoute = Object.freeze({
      boundary: boundary.handle,
      owner: owner?.handle ?? null,
      ancestors: Object.freeze(ancestors),
      externalOwner: owner?.externalOwner ? owner.handle : null,
    });
  };

  const publishOrSchedule = (): void => {
    if (batchDepth > 0) {
      reconciliationPending = true;
    } else {
      publish();
    }
  };

  const reconcile = (): void => {
    reconciliationPending = false;
    try {
      const previousBoundary = boundary;
      const nextBoundary = resolveBoundary();
      const boundaryChanged = nextBoundary !== previousBoundary;
      boundary = nextBoundary;

      const previousFocus = focused;

      if (
        preferredActivatedScope &&
        !preferredActivatedScope.removed &&
        isScopeUsable(preferredActivatedScope) &&
        isWithin(preferredActivatedScope, boundary)
      ) {
        const preferred = preferredTarget(preferredActivatedScope, boundary);
        if (preferred) {
          preferredActivatedScope = null;
          select(preferred, boundary);
          return;
        }
      } else if (!preferredActivatedScope || preferredActivatedScope.removed) {
        preferredActivatedScope = null;
      }

      if (focused && isEligible(focused, boundary)) {
        // Autofocus is a one-shot request. A request that becomes eligible while
        // another target still owns focus is consumed without stealing it.
        consumeAutoFocus(boundary);
        return;
      }

      if (boundaryChanged) {
        const preferred = preferredTarget(boundary, boundary);
        if (preferred) {
          select(preferred, boundary);
          return;
        }
        // Revealing a parent boundary may fall back from the exact outer owner
        // captured when the trap activated. The modal owner's own neighbors
        // never manufacture outer focus, and a trap opened from no focus closes
        // back to no focus.
        if (isWithin(previousBoundary, boundary)) {
          const anchor = previousBoundary.restoreAnchor;
          previousBoundary.restoreAnchor = null;
          if (anchor) {
            if (isEligible(anchor, boundary)) {
              select(anchor, boundary);
              return;
            }
            const fallback = removalFallback(anchor, boundary);
            if (fallback) {
              select(fallback, boundary);
              return;
            }
          }
        }
        focused = null;
        return;
      }

      if (previousFocus) {
        const fallback = removalFallback(previousFocus, boundary);
        if (fallback) {
          select(fallback, boundary);
          return;
        }
        focused = null;
        if (!previousFocus.removed && !boundaryChanged) pendingRestore = previousFocus;
      }

      if (pendingRestore && isEligible(pendingRestore, boundary)) {
        select(pendingRestore, boundary);
        return;
      }

      const auto = consumeAutoFocus(boundary);
      if (auto) select(auto, boundary);
    } finally {
      if (batchDepth === 0) publish();
    }
  };

  const requestReconcile = (): void => {
    if (batchDepth > 0) {
      reconciliationPending = true;
      return;
    }
    reconcile();
  };

  const api: InternalFocusPolicy = {
    rootScope: rootHandle,
    get current() {
      return publishedCurrent?.handle ?? null;
    },
    checkpoint() {
      if (batchDepth > 0 || reconciliationPending) {
        throw new Error("Cannot checkpoint focus policy during reconciliation");
      }
      const state: FocusPolicyCheckpointState = Object.freeze({
        owner: checkpointOwner,
        activation,
        scopes: Object.freeze(
          [...scopeStates.values()].map((scope) =>
            Object.freeze({
              state: scope,
              active: scope.active,
              trapped: scope.trapped,
              removed: scope.removed,
              activation: scope.activation,
              remembered: scope.remembered,
              restoreAnchor: scope.restoreAnchor,
            }),
          ),
        ),
        targets: Object.freeze(
          [...targetStates.values()].map((target) =>
            Object.freeze({
              state: target,
              disabled: target.disabled,
              hidden: target.hidden,
              tabIndex: target.tabIndex,
              autoFocus: target.autoFocus,
              autoFocusConsumed: target.autoFocusConsumed,
              externalOwner: target.externalOwner,
              removed: target.removed,
              fallbackOrder: target.fallbackOrder ? Object.freeze([...target.fallbackOrder]) : null,
            }),
          ),
        ),
        rendered: Object.freeze([...rendered]),
        focused,
        boundary,
        pendingRestore,
        preferredActivatedScope,
      });
      return Object.freeze({ [focusCheckpointState]: state });
    },
    restore(checkpoint) {
      const saved = checkpoint?.[focusCheckpointState];
      if (!saved || saved.owner !== checkpointOwner) {
        throw new Error("Focus checkpoint belongs to a different policy");
      }
      if (batchDepth > 0) throw new Error("Cannot restore focus policy during reconciliation");

      const savedScopes = new Set(saved.scopes.map((entry) => entry.state));
      for (const scope of scopeStates.values()) {
        if (savedScopes.has(scope)) continue;
        scope.active = false;
        scope.removed = true;
      }
      const savedTargets = new Set(saved.targets.map((entry) => entry.state));
      for (const target of targetStates.values()) {
        if (savedTargets.has(target)) continue;
        target.removed = true;
      }

      scopeStates.clear();
      for (const entry of saved.scopes) {
        const scope = entry.state;
        scope.active = entry.active;
        scope.trapped = entry.trapped;
        scope.removed = entry.removed;
        scope.activation = entry.activation;
        scope.remembered = entry.remembered;
        scope.restoreAnchor = entry.restoreAnchor;
        scopeStates.set(scope.handle, scope);
      }
      targetStates.clear();
      for (const entry of saved.targets) {
        const target = entry.state;
        target.disabled = entry.disabled;
        target.hidden = entry.hidden;
        target.tabIndex = entry.tabIndex;
        target.autoFocus = entry.autoFocus;
        target.autoFocusConsumed = entry.autoFocusConsumed;
        target.externalOwner = entry.externalOwner;
        target.removed = entry.removed;
        target.fallbackOrder = entry.fallbackOrder;
        targetStates.set(target.handle, target);
      }

      activation = saved.activation;
      rendered = [...saved.rendered];
      focused = saved.focused;
      boundary = saved.boundary;
      pendingRestore = saved.pendingRestore;
      preferredActivatedScope = saved.preferredActivatedScope;
      reconciliationPending = false;
      publish();
    },
    createScope(options) {
      const parent = options.parent ? stateForScope(options.parent) : root;
      const handle = Object.freeze({ debugLabel: options.debugLabel });
      const state: ScopeState = {
        handle,
        parent,
        active: options.active ?? true,
        trapped: options.trapped ?? false,
        removed: false,
        activation: 0,
        remembered: null,
        restoreAnchor: null,
      };
      if (state.active) state.activation = ++activation;
      if (state.active && state.trapped) state.restoreAnchor = focused;
      scopeStates.set(handle, state);
      requestReconcile();
      return handle;
    },
    updateScope(handle, update) {
      const scope = stateForScope(handle);
      const wasActive = scope.active;
      const wasUsableTrap = scope.trapped && isScopeUsable(scope);
      if (update.active !== undefined) scope.active = update.active;
      if (update.trapped !== undefined) scope.trapped = update.trapped;
      if (!scope.active && preferredActivatedScope === scope) preferredActivatedScope = null;
      const isUsableTrap = scope.trapped && isScopeUsable(scope);
      if (((!wasActive && scope.active) || (!wasUsableTrap && isUsableTrap)) && scope.active) {
        scope.activation = ++activation;
        if (isUsableTrap && !isWithin(boundary, scope)) scope.restoreAnchor = focused;
        preferredActivatedScope = scope;
      }
      requestReconcile();
    },
    removeScope(handle) {
      const scope = stateForScope(handle);
      if (scope === root) throw new Error("Cannot remove the internal root focus scope");
      const removedScopes = [...scopeStates.values()].filter(
        (candidate) => candidate === scope || isWithin(candidate, scope),
      );
      const removedTargets = [...targetStates.values()].filter((target) =>
        removedScopes.includes(target.scope),
      );
      const previousOrder = Object.freeze([...rendered]);
      for (const target of removedTargets) {
        target.fallbackOrder ??= previousOrder;
        target.removed = true;
        clearMemories(target);
      }
      rendered = rendered.filter((target) => !removedTargets.includes(target));
      for (const removed of removedScopes) {
        removed.active = false;
        removed.removed = true;
        scopeStates.delete(removed.handle);
      }
      requestReconcile();
    },
    createTarget(options) {
      const scope = options.scope ? stateForScope(options.scope) : root;
      const handle = Object.freeze({ debugLabel: options.debugLabel });
      const state: TargetState = {
        handle,
        scope,
        disabled: options.disabled ?? false,
        hidden: options.hidden ?? false,
        tabIndex: options.tabIndex ?? 0,
        autoFocus: options.autoFocus ?? false,
        autoFocusConsumed: false,
        externalOwner: options.externalOwner ?? false,
        removed: false,
        fallbackOrder: null,
      };
      targetStates.set(handle, state);
      requestReconcile();
      return handle;
    },
    updateTarget(handle, update) {
      const target = stateForTarget(handle);
      if (update.disabled !== undefined) target.disabled = update.disabled;
      if (update.hidden !== undefined) target.hidden = update.hidden;
      if (update.tabIndex !== undefined) target.tabIndex = update.tabIndex;
      if (update.autoFocus !== undefined) {
        if (!target.autoFocus && update.autoFocus) target.autoFocusConsumed = false;
        target.autoFocus = update.autoFocus;
      }
      if (update.externalOwner !== undefined) target.externalOwner = update.externalOwner;
      requestReconcile();
    },
    removeTarget(handle) {
      const target = stateForTarget(handle);
      target.fallbackOrder ??= Object.freeze([...rendered]);
      target.removed = true;
      rendered = rendered.filter((candidate) => candidate !== target);
      clearMemories(target);
      requestReconcile();
    },
    setRenderedOrder(handles) {
      const seen = new Set<InternalFocusTarget>();
      const next = handles.map((handle) => {
        if (seen.has(handle)) throw new Error("Rendered focus order contains a duplicate target");
        seen.add(handle);
        return stateForTarget(handle);
      });
      const previousOrder = Object.freeze([...rendered]);
      for (const target of previousOrder) {
        if (!next.includes(target)) target.fallbackOrder = previousOrder;
      }
      rendered = next;
      for (const target of rendered) target.fallbackOrder = null;
      requestReconcile();
    },
    batch(change) {
      batchDepth++;
      try {
        change();
      } finally {
        batchDepth--;
        if (batchDepth === 0 && reconciliationPending) reconcile();
      }
    },
    focus(handle) {
      const target = targetStates.get(handle);
      if (!target || target.removed) return false;
      boundary = resolveBoundary();
      if (!isEligible(target, boundary)) return false;
      select(target, boundary);
      publishOrSchedule();
      return true;
    },
    blur(handle) {
      const requested = handle ? targetStates.get(handle) : null;
      if (handle && (!requested || requested.removed)) return false;
      const previous = requested ?? focused ?? pendingRestore;
      if (!previous) return false;
      if (requested && focused !== requested && pendingRestore !== requested) return false;
      focused = null;
      pendingRestore = null;
      for (let scope: ScopeState | null = previous.scope; scope; scope = scope.parent) {
        if (scope.remembered === previous) scope.remembered = null;
        if (scope === boundary) break;
      }
      publishOrSchedule();
      return true;
    },
    focusNext() {
      boundary = resolveBoundary();
      const candidates = sequentialTargets(boundary);
      if (candidates.length === 0) return false;
      const currentOrder = focused ? rendered.indexOf(focused) : -1;
      const next =
        candidates.find((candidate) => rendered.indexOf(candidate) > currentOrder) ??
        candidates[0]!;
      select(next, boundary);
      publishOrSchedule();
      return true;
    },
    focusPrevious() {
      boundary = resolveBoundary();
      const candidates = sequentialTargets(boundary);
      if (candidates.length === 0) return false;
      const currentOrder = focused ? rendered.indexOf(focused) : rendered.length;
      let previous: TargetState | undefined;
      for (const candidate of candidates) {
        if (rendered.indexOf(candidate) < currentOrder) previous = candidate;
      }
      select(previous ?? candidates.at(-1)!, boundary);
      publishOrSchedule();
      return true;
    },
    inputSignature() {
      return Object.freeze({
        rendered: Object.freeze(rendered.map((target) => target.handle)),
        sequential: Object.freeze(sequentialTargets(boundary).map((target) => target.handle)),
      });
    },
    route() {
      return publishedRoute;
    },
  };

  return api;
}
