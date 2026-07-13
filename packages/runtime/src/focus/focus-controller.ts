import { computed, shallowRef, type ShallowRef } from "vue";
import Yoga from "yoga-layout";
import { isContainer, type TuiNode, type TuiRoot } from "../host/nodes.ts";
import type {
  InternalInputDefaultDecision,
  InternalInputExternalRecipient,
  InternalInputRouteDecision,
  InternalInputRouteRecipient,
  InternalNormalizedInputSource,
} from "../io/input-route-policy.ts";
import type {
  InternalInputActivationRegistration,
  InternalInputRoutingRuntime,
  InternalInputTopologySelection,
} from "../io/input-route-runtime.ts";
import type { NormalizedInputFact } from "../io/normalized-input.ts";
import type { RenderedTargetTransactionHost } from "../rendered-target.ts";
import {
  createInternalFocusPolicy,
  type InternalFocusCheckpoint,
  type InternalFocusPolicy,
  type InternalFocusScope,
  type InternalFocusTarget,
} from "./focus-policy.ts";

export interface InternalFocusTargetHandle {
  readonly isFocused: Readonly<ShallowRef<boolean>>;
  focus(): boolean;
  blur(): boolean;
}

export interface InternalFocusTargetDependent {
  hostChanged(host: TuiNode | null): void;
  disposed(): void;
}

export interface InternalFocusScopeHandle {
  readonly containsFocus: Readonly<ShallowRef<boolean>>;
}

export interface InternalFocusTargetOptions {
  readonly scope?: InternalFocusScopeHandle;
  readonly disabled?: boolean;
  readonly tabIndex?: 0 | -1;
  readonly autoFocus?: boolean;
}

export interface InternalFocusScopeOptions {
  readonly parent?: InternalFocusScopeHandle;
  readonly active?: boolean;
  readonly trapped?: boolean;
}

export interface InternalFocusTargetUpdate {
  readonly disabled?: boolean;
  readonly tabIndex?: 0 | -1;
  readonly autoFocus?: boolean;
}

export interface InternalFocusScopeUpdate {
  readonly active?: boolean;
  readonly trapped?: boolean;
}

export type InternalFocusInputHandler = (fact: NormalizedInputFact) => InternalInputRouteDecision;
export type InternalFocusExternalHandler = (source: InternalNormalizedInputSource) => void;

export interface InternalFocusController extends RenderedTargetTransactionHost {
  readonly focusedTarget: Readonly<ShallowRef<InternalFocusTargetHandle | null>>;
  readonly effectiveTarget: Readonly<ShallowRef<InternalFocusTargetHandle | null>>;
  createTarget(options?: InternalFocusTargetOptions): InternalFocusTargetHandle;
  updateTarget(target: InternalFocusTargetHandle, update: InternalFocusTargetUpdate): void;
  removeTarget(target: InternalFocusTargetHandle): void;
  createScope(options?: InternalFocusScopeOptions): InternalFocusScopeHandle;
  updateScope(scope: InternalFocusScopeHandle, update: InternalFocusScopeUpdate): void;
  removeScope(scope: InternalFocusScopeHandle): void;
  attachTarget(target: InternalFocusTargetHandle, host: TuiNode): () => void;
  registerTargetDependent(
    target: InternalFocusTargetHandle,
    dependent: InternalFocusTargetDependent,
  ): () => void;
  registerTargetInput(
    target: InternalFocusTargetHandle,
    handler: InternalFocusInputHandler,
  ): () => void;
  registerScopeInput(
    scope: InternalFocusScopeHandle,
    handler: InternalFocusInputHandler,
  ): () => void;
  registerExternal(
    target: InternalFocusTargetHandle,
    handler: InternalFocusExternalHandler,
  ): () => void;
  focusNext(): boolean;
  focusPrevious(): boolean;
  blur(): boolean;
  reconcileRenderedTree(): void;
  dispose(): void;
}

interface InputRegistration {
  readonly handler: InternalFocusInputHandler;
  active: boolean;
}

interface ExternalRegistration {
  readonly handler: InternalFocusExternalHandler;
  active: boolean;
}

interface TargetDependentRegistration {
  readonly dependent: InternalFocusTargetDependent;
  active: boolean;
}

interface ScopeRecord {
  readonly handle: InternalFocusScopeHandle;
  policy: InternalFocusScope;
  readonly parent: ScopeRecord | null;
  readonly containsFocusRef: Readonly<ShallowRef<boolean>>;
  readonly input: Set<InputRegistration>;
  active: boolean;
  trapped: boolean;
  disposed: boolean;
}

interface TargetRecord {
  readonly handle: InternalFocusTargetHandle;
  policy: InternalFocusTarget;
  readonly scope: ScopeRecord | null;
  readonly isFocusedRef: Readonly<ShallowRef<boolean>>;
  readonly input: Set<InputRegistration>;
  readonly dependents: Set<TargetDependentRegistration>;
  disabled: boolean;
  tabIndex: 0 | -1;
  autoFocus: boolean;
  external: ExternalRegistration | null;
  observedHost: TuiNode | null;
  observedToken: symbol | null;
  acceptedHost: TuiNode | null;
  disposed: boolean;
}

type RouteRegistration =
  | InternalInputActivationRegistration<
      InternalInputRouteRecipient | InternalInputExternalRecipient
    >
  | InternalInputActivationRegistration<{
      readonly id: string;
      readonly handle: (fact: NormalizedInputFact) => InternalInputDefaultDecision;
    }>;

interface FocusGeneration {
  readonly owner: TargetRecord | null;
  readonly registrations: RouteRegistration[];
  readonly hasSequentialTarget: boolean;
  selection: InternalInputTopologySelection;
  inputDemand: boolean;
  accepted: boolean;
  endSelection: () => void;
}

interface CreateInternalFocusControllerOptions {
  readonly root: TuiRoot;
  readonly inputRouting: InternalInputRoutingRuntime;
  readonly inert?: boolean;
}

interface PublicFocusSnapshot {
  readonly owner: TargetRecord | null;
  readonly containingScopes: ReadonlySet<ScopeRecord>;
}

const noDefaultAction = (): InternalInputDefaultDecision => ({
  performed: false,
  continue: true,
  blockExternal: false,
});

function isTabFact(
  fact: NormalizedInputFact,
): fact is Extract<NormalizedInputFact, { readonly kind: "key" }> {
  if (fact.kind !== "key" || fact.key.name !== "tab" || fact.key.phase === "release") {
    return false;
  }
  const modifiers = fact.key.modifiers;
  return (
    !modifiers.alt && !modifiers.ctrl && !modifiers.super && !modifiers.hyper && !modifiers.meta
  );
}

function isDisplayNone(node: TuiNode): boolean {
  const yoga = (node as { yoga?: { getDisplay?: () => number } }).yoga;
  return yoga?.getDisplay?.() === Yoga.DISPLAY_NONE;
}

function isInSubtree(node: TuiNode, subtree: TuiNode): boolean {
  for (let current: TuiNode | null = node; current; current = current.parent) {
    if (current === subtree) return true;
  }
  return false;
}

function endGeneration(generation: FocusGeneration | null): void {
  if (!generation) return;
  generation.endSelection();
  for (const registration of generation.registrations) registration.end();
}

export function createInternalFocusController(
  options: CreateInternalFocusControllerOptions,
): InternalFocusController {
  const { root, inputRouting, inert = false } = options;
  const policy: InternalFocusPolicy = createInternalFocusPolicy();
  const targetRecords = new Set<TargetRecord>();
  const scopeRecords = new Set<ScopeRecord>();
  const targetByHandle = new WeakMap<InternalFocusTargetHandle, TargetRecord>();
  const scopeByHandle = new WeakMap<InternalFocusScopeHandle, ScopeRecord>();
  const targetByPolicy = new Map<InternalFocusTarget, TargetRecord>();
  const scopeByPolicy = new Map<InternalFocusScope, ScopeRecord>();
  const publicSnapshotRef = shallowRef<PublicFocusSnapshot>(
    Object.freeze({ owner: null, containingScopes: Object.freeze(new Set<ScopeRecord>()) }),
  );
  const focusedTargetRef = computed(
    () => publicSnapshotRef.value.owner?.handle ?? null,
  ) as unknown as Readonly<ShallowRef<InternalFocusTargetHandle | null>>;
  const effectiveTargetRef = shallowRef<InternalFocusTargetHandle | null>(null);

  let disposed = false;
  let currentGeneration: FocusGeneration | null = null;
  let revision = 0;
  let transactionDepth = 0;
  let currentTransactionKind: "reconcile" | "cleanup" | "logical" | null = null;
  let transactionCheckpoint: InternalFocusCheckpoint | null = null;
  let undo: Array<() => void> = [];
  let logicalDirty = false;
  let hostDirty = false;
  let routeInvalidated = false;
  let selectionWasDisplaced = false;

  const stateForTarget = (handle: InternalFocusTargetHandle): TargetRecord => {
    const record = targetByHandle.get(handle);
    if (!record || record.disposed) {
      throw new Error("Focus target belongs to another application or has been disposed");
    }
    return record;
  };

  const stateForScope = (handle: InternalFocusScopeHandle): ScopeRecord => {
    const record = scopeByHandle.get(handle);
    if (!record || record.disposed) {
      throw new Error("Focus scope belongs to another application or has been disposed");
    }
    return record;
  };

  const notifyAcceptedHost = (record: TargetRecord, host: TuiNode | null): void => {
    const registrations = Array.from(record.dependents);
    for (const registration of registrations) {
      if (registration.active) registration.dependent.hostChanged(host);
    }
  };

  const disposeTargetDependents = (record: TargetRecord): void => {
    const registrations = [...record.dependents];
    record.dependents.clear();
    for (const registration of registrations) registration.active = false;
    for (const registration of registrations) registration.dependent.disposed();
  };

  const stageLogical = <Value>(change: () => Value, rollback: () => void): Value => {
    const value = change();
    undo.push(rollback);
    revision++;
    logicalDirty = true;
    return value;
  };

  const stageHost = (change: () => void): void => {
    change();
    revision++;
    hostDirty = true;
  };

  const reconcileRenderedFacts = (): void => {
    const order: InternalFocusTarget[] = [];
    const hidden = new Map<TargetRecord, boolean>();
    const targetByHost = new Map<TuiNode, TargetRecord>();
    for (const target of targetRecords) {
      if (target.disposed || !target.observedHost) continue;
      const occupied = targetByHost.get(target.observedHost);
      if (occupied && occupied !== target) {
        throw new Error("A rendered host cannot own more than one focus target");
      }
      targetByHost.set(target.observedHost, target);
    }

    const visit = (node: TuiNode, ancestorHidden: boolean): void => {
      const nodeHidden = ancestorHidden || isDisplayNone(node);
      const target = targetByHost.get(node);
      if (target && !target.disposed) {
        order.push(target.policy);
        hidden.set(target, nodeHidden);
      }
      if (!isContainer(node)) return;
      for (const child of node.children) visit(child, nodeHidden);
    };

    for (const child of root.children) visit(child, isDisplayNone(root));
    policy.batch(() => {
      for (const target of targetRecords) {
        if (target.disposed) continue;
        policy.updateTarget(target.policy, { hidden: hidden.get(target) ?? false });
      }
      policy.setRenderedOrder(order);
    });
  };

  const aggregateRecipient = (
    id: string,
    handlers: readonly InputRegistration[],
  ): InternalInputRouteRecipient =>
    Object.freeze({
      id,
      handle(fact: NormalizedInputFact) {
        const result = {
          performed: false,
          continue: true,
          preventDefault: false,
          blockExternal: false,
        };
        for (const registration of handlers) {
          const decision = registration.handler(fact);
          result.performed ||= decision.performed;
          result.continue &&= decision.continue;
          result.preventDefault ||= decision.preventDefault;
          result.blockExternal ||= decision.blockExternal;
        }
        return Object.freeze(result);
      },
    });

  const activeInput = (records: Set<InputRegistration>): readonly InputRegistration[] =>
    Object.freeze([...records].filter((registration) => registration.active));

  const buildGeneration = (expectedRevision: number): FocusGeneration => {
    const route = policy.route();
    const owner = route.owner ? (targetByPolicy.get(route.owner) ?? null) : null;
    const registrations: RouteRegistration[] = [];
    const generation: FocusGeneration = {
      owner,
      registrations,
      hasSequentialTarget: policy.hasSequentialTarget(),
      selection: {},
      inputDemand: false,
      accepted: false,
      endSelection: () => {},
    };

    const registerScope = (scope: ScopeRecord | undefined, id: string) => {
      if (!scope || scope.disposed) return undefined;
      const handlers = activeInput(scope.input);
      if (handlers.length === 0) return undefined;
      const registration = inputRouting.registerSemantic(aggregateRecipient(id, handlers));
      registrations.push(registration);
      return registration.lease;
    };

    const boundary = scopeByPolicy.get(route.boundary);
    const boundaryLease = registerScope(boundary, "focus:boundary");

    let ownerLease;
    if (owner && !owner.disposed) {
      const handlers = activeInput(owner.input);
      if (handlers.length > 0) {
        const registration = inputRouting.registerSemantic(
          aggregateRecipient("focus:target", handlers),
        );
        registrations.push(registration);
        ownerLease = registration.lease;
      }
    }

    const ancestorLeases = route.ancestors.flatMap((scope, index) => {
      const lease = registerScope(scopeByPolicy.get(scope), `focus:ancestor:${index}`);
      return lease ? [lease] : [];
    });

    let externalLease;
    if (owner?.external?.active && route.externalOwner === owner.policy) {
      const external = owner.external;
      const recipient: InternalInputExternalRecipient = Object.freeze({
        id: "focus:external",
        receive: (source: InternalNormalizedInputSource) => external.handler(source),
      });
      const registration = inputRouting.registerExternal(recipient);
      registrations.push(registration);
      externalLease = registration.lease;
    }

    const tabRegistration = inputRouting.registerDefault({
      id: "focus:tab",
      handle(fact) {
        if (!isTabFact(fact)) return noDefaultAction();
        if (currentGeneration !== generation) {
          return generation.hasSequentialTarget
            ? Object.freeze({ performed: false, continue: true, blockExternal: true })
            : noDefaultAction();
        }
        const moved = fact.key.modifiers.shift ? api.focusPrevious() : api.focusNext();
        return moved
          ? Object.freeze({ performed: true, continue: true, blockExternal: true })
          : noDefaultAction();
      },
    });
    registrations.push(tabRegistration);

    generation.inputDemand =
      generation.hasSequentialTarget ||
      Boolean(boundaryLease || ownerLease || ancestorLeases.length > 0 || externalLease);

    try {
      generation.selection = Object.freeze({
        activeBoundary: boundaryLease,
        focusedOwner: ownerLease,
        logicalAncestors: Object.freeze(ancestorLeases),
        applicationDefaults: Object.freeze([tabRegistration.lease]),
        external: externalLease,
      });
      const endSelection = inputRouting.select(generation.selection, {
        inputDemand: generation.inputDemand,
        isCurrent: () => revision === expectedRevision,
      });
      generation.accepted = endSelection.accepted;
      generation.endSelection = endSelection;
      return generation;
    } catch (error) {
      for (const registration of registrations) registration.end();
      throw error;
    }
  };

  const commitRefs = (generation: FocusGeneration | null): void => {
    const owner = inert ? null : (generation?.owner ?? null);
    const containingScopes = new Set<ScopeRecord>();
    for (const scope of scopeRecords) {
      if (!scope.disposed && owner) {
        for (let current = owner.scope; current; current = current.parent) {
          if (current === scope) {
            containingScopes.add(scope);
            break;
          }
        }
      }
    }
    publicSnapshotRef.value = Object.freeze({
      owner,
      containingScopes: Object.freeze(containingScopes),
    });
  };

  const commitEffectiveTarget = (generation: FocusGeneration | null): void => {
    effectiveTargetRef.value = inert ? null : (generation?.owner?.handle ?? null);
  };

  const publishStableGeneration = (): void => {
    if (inert) {
      commitEffectiveTarget(null);
      commitRefs(null);
      return;
    }

    // With no focus or scope lifetime, this controller owns no selected path.
    // Besides avoiding a meaningless empty generation, this lets private F3
    // fixtures select an explicit topology in applications that do not use F4.
    // Ending our previous generation is safe when a later owner already won:
    // the F3 disposer only clears the selection when it still owns it.
    if (targetRecords.size === 0 && scopeRecords.size === 0) {
      const previous = currentGeneration;
      currentGeneration = null;
      commitEffectiveTarget(null);
      commitRefs(null);
      endGeneration(previous);
      return;
    }

    const superseded: FocusGeneration[] = [];
    while (true) {
      const observedRevision = revision;
      let generation: FocusGeneration;
      try {
        generation = buildGeneration(observedRevision);
      } catch (error) {
        for (const transient of superseded) endGeneration(transient);
        throw error;
      }
      if (observedRevision !== revision) {
        selectionWasDisplaced ||= generation.accepted;
        superseded.push(generation);
        continue;
      }
      if (!generation.accepted) {
        endGeneration(generation);
        throw new Error("Focus route selection rejected a current generation");
      }

      const previous = currentGeneration;
      currentGeneration = generation;
      commitEffectiveTarget(generation);
      commitRefs(generation);
      endGeneration(previous);
      for (const transient of superseded) endGeneration(transient);
      return;
    }
  };

  const flush = (kind: "reconcile" | "cleanup" | "logical"): void => {
    if (kind === "cleanup") return;
    if (kind === "reconcile") {
      if (!hostDirty && !logicalDirty && currentGeneration) return;
      const wasInvalidated = routeInvalidated;
      routeInvalidated = false;
      try {
        reconcileRenderedFacts();
        publishStableGeneration();
      } catch (error) {
        routeInvalidated = wasInvalidated;
        throw error;
      }
      for (const target of targetRecords) {
        const acceptedHost = target.observedHost;
        if (target.acceptedHost === acceptedHost) continue;
        target.acceptedHost = acceptedHost;
        notifyAcceptedHost(target, acceptedHost);
      }
      hostDirty = false;
      logicalDirty = false;
      return;
    }
    if (routeInvalidated) return;
    if (!logicalDirty) return;
    publishStableGeneration();
    logicalDirty = false;
  };

  const rollbackTransaction = (): void => {
    if (transactionCheckpoint) policy.restore(transactionCheckpoint);
    for (let index = undo.length - 1; index >= 0; index--) {
      try {
        undo[index]!();
      } catch {
        // Controller rollback functions mutate only private maps and flags. Keep
        // restoring the rest if one future adapter violates that invariant.
      }
    }
    if (selectionWasDisplaced && currentGeneration && !routeInvalidated) {
      try {
        currentGeneration.endSelection = inputRouting.select(currentGeneration.selection, {
          inputDemand: currentGeneration.inputDemand,
        });
      } catch {
        // A later intent already displaced the accepted selection and restoring
        // its physical demand also failed. Keep public focus stable but fail the
        // managed route closed; a later successful mutation can republish it.
        invalidateSelectedRoute();
      }
    }
    selectionWasDisplaced = false;
    if (!routeInvalidated) {
      commitEffectiveTarget(currentGeneration);
      commitRefs(currentGeneration);
    }
  };

  const runTransaction = (kind: "reconcile" | "cleanup" | "logical", change: () => void): void => {
    if (disposed) throw new Error("Focus controller is disposed");
    if (transactionDepth > 0) {
      change();
      return;
    }

    transactionCheckpoint = policy.checkpoint();
    undo = [];
    transactionDepth = 1;
    currentTransactionKind = kind;
    try {
      if (kind === "reconcile") hostDirty = true;
      change();
      flush(kind);
    } catch (error) {
      rollbackTransaction();
      throw error;
    } finally {
      transactionDepth = 0;
      currentTransactionKind = null;
      transactionCheckpoint = null;
      undo = [];
      selectionWasDisplaced = false;
    }
  };

  const mutate = <Value>(change: () => Value, rollback: () => void): Value => {
    let value!: Value;
    runTransaction("logical", () => {
      value = stageLogical(change, rollback);
    });
    return value;
  };

  const mutateHost = (change: () => void): void => {
    if (transactionDepth > 0) {
      stageHost(change);
      return;
    }
    runTransaction("reconcile", () => stageHost(change));
  };

  const invalidateSelectedRoute = (): void => {
    endGeneration(currentGeneration);
    currentGeneration = null;
    commitEffectiveTarget(null);
    routeInvalidated = true;
  };

  const mutateDisposal = (change: () => void): void => {
    if (transactionDepth > 0) {
      change();
      revision++;
      logicalDirty = true;
      return;
    }
    transactionDepth = 1;
    currentTransactionKind = "logical";
    try {
      change();
      revision++;
      logicalDirty = true;
      flush("logical");
    } catch (error) {
      // A Vue lifetime that ended cannot be rolled back into existence. Keep
      // the disposal, end the old route, and expose no focus until a later
      // authoritative generation can be selected.
      invalidateSelectedRoute();
      commitEffectiveTarget(null);
      commitRefs(null);
      throw error;
    } finally {
      transactionDepth = 0;
      currentTransactionKind = null;
      transactionCheckpoint = null;
      undo = [];
      selectionWasDisplaced = false;
    }
  };

  const focusRecord = (record: TargetRecord): boolean => {
    if (disposed || inert || record.disposed) return false;
    return mutate(
      () => policy.focus(record.policy),
      () => {},
    );
  };

  const blurRecord = (record: TargetRecord): boolean => {
    if (disposed || inert || record.disposed) return false;
    return mutate(
      () => policy.blur(record.policy),
      () => {},
    );
  };

  const api: InternalFocusController = {
    focusedTarget: focusedTargetRef,
    effectiveTarget: effectiveTargetRef,
    createTarget(targetOptions = {}) {
      const scope = targetOptions.scope ? stateForScope(targetOptions.scope) : null;
      let record!: TargetRecord;
      const isFocusedRef = computed(
        () => !record?.disposed && publicSnapshotRef.value.owner === record,
      ) as unknown as Readonly<ShallowRef<boolean>>;
      const handle: InternalFocusTargetHandle = Object.freeze({
        isFocused: isFocusedRef,
        focus: () => focusRecord(record),
        blur: () => blurRecord(record),
      });
      record = {
        handle,
        policy: undefined as unknown as InternalFocusTarget,
        scope,
        isFocusedRef,
        input: new Set(),
        dependents: new Set(),
        disabled: targetOptions.disabled ?? false,
        tabIndex: targetOptions.tabIndex ?? 0,
        autoFocus: targetOptions.autoFocus ?? false,
        external: null,
        observedHost: null,
        observedToken: null,
        acceptedHost: null,
        disposed: false,
      };
      const created = mutate(
        () => {
          record.policy = policy.createTarget({
            debugLabel: `target:${targetRecords.size + 1}`,
            scope: scope?.policy,
            disabled: record.disabled,
            tabIndex: record.tabIndex,
            autoFocus: record.autoFocus,
          });
          targetRecords.add(record);
          targetByHandle.set(handle, record);
          targetByPolicy.set(record.policy, record);
          return handle;
        },
        () => {
          record.disposed = true;
          targetRecords.delete(record);
          targetByPolicy.delete(record.policy);
        },
      );
      return created;
    },
    updateTarget(handle, update) {
      const record = stateForTarget(handle);
      const previous = {
        disabled: record.disabled,
        tabIndex: record.tabIndex,
        autoFocus: record.autoFocus,
      };
      mutate(
        () => {
          if (update.disabled !== undefined) record.disabled = update.disabled;
          if (update.tabIndex !== undefined) record.tabIndex = update.tabIndex;
          if (update.autoFocus !== undefined) record.autoFocus = update.autoFocus;
          policy.updateTarget(record.policy, update);
        },
        () => Object.assign(record, previous),
      );
    },
    removeTarget(handle) {
      const record = stateForTarget(handle);
      mutateDisposal(() => {
        policy.removeTarget(record.policy);
        record.disposed = true;
        record.observedHost = null;
        record.observedToken = null;
        record.acceptedHost = null;
        targetRecords.delete(record);
        targetByPolicy.delete(record.policy);
        disposeTargetDependents(record);
      });
    },
    createScope(scopeOptions = {}) {
      const parent = scopeOptions.parent ? stateForScope(scopeOptions.parent) : null;
      let record!: ScopeRecord;
      const containsFocusRef = computed(
        () => !record?.disposed && publicSnapshotRef.value.containingScopes.has(record),
      ) as unknown as Readonly<ShallowRef<boolean>>;
      const handle: InternalFocusScopeHandle = Object.freeze({
        containsFocus: containsFocusRef,
      });
      record = {
        handle,
        policy: undefined as unknown as InternalFocusScope,
        parent,
        containsFocusRef,
        input: new Set(),
        active: scopeOptions.active ?? true,
        trapped: scopeOptions.trapped ?? false,
        disposed: false,
      };
      return mutate(
        () => {
          record.policy = policy.createScope({
            debugLabel: `scope:${scopeRecords.size + 1}`,
            parent: parent?.policy,
            active: record.active,
            trapped: record.trapped,
          });
          scopeRecords.add(record);
          scopeByHandle.set(handle, record);
          scopeByPolicy.set(record.policy, record);
          return handle;
        },
        () => {
          record.disposed = true;
          scopeRecords.delete(record);
          scopeByPolicy.delete(record.policy);
        },
      );
    },
    updateScope(handle, update) {
      const record = stateForScope(handle);
      const previous = { active: record.active, trapped: record.trapped };
      mutate(
        () => {
          if (update.active !== undefined) record.active = update.active;
          if (update.trapped !== undefined) record.trapped = update.trapped;
          policy.updateScope(record.policy, update);
        },
        () => Object.assign(record, previous),
      );
    },
    removeScope(handle) {
      const record = stateForScope(handle);
      const removedScopes = [...scopeRecords].filter((candidate) => {
        for (let current: ScopeRecord | null = candidate; current; current = current.parent) {
          if (current === record) return true;
        }
        return false;
      });
      const removedScopeSet = new Set(removedScopes);
      const removedTargets = [...targetRecords].filter(
        (target) => target.scope && removedScopeSet.has(target.scope),
      );
      mutateDisposal(() => {
        policy.removeScope(record.policy);
        for (const target of removedTargets) {
          target.disposed = true;
          targetRecords.delete(target);
          targetByPolicy.delete(target.policy);
        }
        for (const scope of removedScopes) {
          scope.disposed = true;
          scopeRecords.delete(scope);
          scopeByPolicy.delete(scope.policy);
        }
        for (const target of removedTargets) disposeTargetDependents(target);
      });
    },
    attachTarget(handle, host) {
      const record = stateForTarget(handle);
      if (inert) return () => {};
      const attachment = Symbol("focus-target-attachment");
      mutateHost(() => {
        record.observedHost = host;
        record.observedToken = attachment;
      });

      let attached = true;
      return () => {
        if (!attached) return;
        attached = false;
        if (
          record.disposed ||
          record.observedHost !== host ||
          record.observedToken !== attachment
        ) {
          return;
        }
        mutateHost(() => {
          record.observedHost = null;
          record.observedToken = null;
          if (currentTransactionKind === "cleanup" && record.acceptedHost === host) {
            invalidateSelectedRoute();
          }
        });
      };
    },
    registerTargetDependent(handle, dependent) {
      const target = stateForTarget(handle);
      const registration: TargetDependentRegistration = { dependent, active: true };
      target.dependents.add(registration);
      try {
        dependent.hostChanged(target.acceptedHost);
      } catch (error) {
        registration.active = false;
        target.dependents.delete(registration);
        throw error;
      }
      return () => {
        if (!registration.active) return;
        registration.active = false;
        target.dependents.delete(registration);
      };
    },
    registerTargetInput(handle, handler) {
      const target = stateForTarget(handle);
      const registration: InputRegistration = { handler, active: true };
      mutate(
        () => target.input.add(registration),
        () => target.input.delete(registration),
      );
      return () => {
        if (!registration.active) return;
        registration.active = false;
        if (target.disposed) return;
        mutate(
          () => target.input.delete(registration),
          () => {
            registration.active = true;
            target.input.add(registration);
          },
        );
      };
    },
    registerScopeInput(handle, handler) {
      const scope = stateForScope(handle);
      const registration: InputRegistration = { handler, active: true };
      mutate(
        () => scope.input.add(registration),
        () => scope.input.delete(registration),
      );
      return () => {
        if (!registration.active) return;
        registration.active = false;
        if (scope.disposed) return;
        mutate(
          () => scope.input.delete(registration),
          () => {
            registration.active = true;
            scope.input.add(registration);
          },
        );
      };
    },
    registerExternal(handle, handler) {
      const target = stateForTarget(handle);
      if (target.external?.active) {
        throw new Error("A focus target cannot own more than one external input receiver");
      }
      const registration: ExternalRegistration = { handler, active: true };
      mutate(
        () => {
          target.external = registration;
          policy.updateTarget(target.policy, { externalOwner: true });
        },
        () => {
          target.external = null;
        },
      );
      return () => {
        if (!registration.active) return;
        registration.active = false;
        if (target.disposed || target.external !== registration) return;
        mutate(
          () => {
            target.external = null;
            policy.updateTarget(target.policy, { externalOwner: false });
          },
          () => {
            registration.active = true;
            target.external = registration;
          },
        );
      };
    },
    focusNext() {
      if (disposed || inert) return false;
      return mutate(
        () => policy.focusNext(),
        () => {},
      );
    },
    focusPrevious() {
      if (disposed || inert) return false;
      return mutate(
        () => policy.focusPrevious(),
        () => {},
      );
    },
    blur() {
      if (disposed || inert) return false;
      return mutate(
        () => policy.blur(),
        () => {},
      );
    },
    transaction(kind, change) {
      runTransaction(kind, change);
    },
    beforeInvalidateSubtree(subtree) {
      runTransaction("cleanup", () => {
        let affected = false;
        const unavailable: TargetRecord[] = [];
        for (const target of targetRecords) {
          const observedAffected = Boolean(
            target.observedHost && isInSubtree(target.observedHost, subtree),
          );
          const acceptedAffected = Boolean(
            target.acceptedHost && isInSubtree(target.acceptedHost, subtree),
          );
          if (!observedAffected && !acceptedAffected) continue;
          affected = true;
          if (observedAffected) {
            stageHost(() => {
              target.observedHost = null;
              target.observedToken = null;
            });
          }
          if (!target.observedHost) unavailable.push(target);
        }
        if (!affected) return;
        // Host removal is not yet an authoritative renderer commit. End the
        // selected route immediately so cleanup-reentrant facts fail closed,
        // but retain public focus refs until the commit can reconcile a final
        // fallback or an atomic keyed replacement.
        invalidateSelectedRoute();
        policy.batch(() => {
          for (const target of unavailable) {
            policy.updateTarget(target.policy, { hidden: true });
          }
        });
        // A removed renderer lifetime is irreversible. Cleanup errors must not
        // restore policy eligibility for targets that F2 already invalidated.
        transactionCheckpoint = policy.checkpoint();
        undo = [];
      });
    },
    reconcileRenderedTree() {
      runTransaction("reconcile", () => {});
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      endGeneration(currentGeneration);
      currentGeneration = null;
      for (const target of targetRecords) {
        target.disposed = true;
      }
      for (const scope of scopeRecords) {
        scope.disposed = true;
      }
      publicSnapshotRef.value = Object.freeze({
        owner: null,
        containingScopes: Object.freeze(new Set<ScopeRecord>()),
      });
      effectiveTargetRef.value = null;
      for (const target of targetRecords) disposeTargetDependents(target);
      targetByPolicy.clear();
      scopeByPolicy.clear();
      targetRecords.clear();
      scopeRecords.clear();
    },
  };

  runTransaction("logical", () => {
    revision++;
    logicalDirty = true;
  });

  return api;
}
