import type {
  InternalInputDefaultRecipient,
  InternalInputExternalRecipient,
  InternalInputRouteCandidate,
  InternalInputRouteRecipient,
} from "./input-route-policy.ts";

const activationState: unique symbol = Symbol("vue-tui.internal.input-route-activation");

interface ActivationState<Value> {
  readonly owner: symbol;
  readonly kind: "semantic" | "default" | "external";
  readonly value: Value;
  active: boolean;
  readonly dependentSelections: Set<SelectionGeneration>;
  readonly globalSelections: Set<SelectionGeneration>;
}

/** Opaque, non-reusable identity for one private input recipient attachment. */
export interface InternalInputActivationLease<Value> {
  readonly [activationState]: ActivationState<Value>;
}

export interface InternalInputActivationRegistration<Value> {
  readonly lease: InternalInputActivationLease<Value>;
  end(): void;
}

export interface InternalInputTopologySelection {
  /** These survive selection replacement when their own leases remain active. */
  readonly applicationGlobal?: readonly InternalInputActivationLease<InternalInputRouteRecipient>[];
  readonly activeBoundary?: InternalInputActivationLease<InternalInputRouteRecipient>;
  readonly focusedOwner?: InternalInputActivationLease<InternalInputRouteRecipient>;
  readonly logicalAncestors?: readonly InternalInputActivationLease<InternalInputRouteRecipient>[];
  readonly ownerDefaults?: readonly InternalInputActivationLease<InternalInputDefaultRecipient>[];
  readonly applicationDefaults?: readonly InternalInputActivationLease<InternalInputDefaultRecipient>[];
  readonly external?: InternalInputActivationLease<InternalInputExternalRecipient>;
}

interface SelectionGeneration {
  active: boolean;
  readonly applicationGlobal: readonly InternalInputActivationLease<InternalInputRouteRecipient>[];
  readonly activeBoundary: InternalInputActivationLease<InternalInputRouteRecipient> | undefined;
  readonly focusedOwner: InternalInputActivationLease<InternalInputRouteRecipient> | undefined;
  readonly logicalAncestors: readonly InternalInputActivationLease<InternalInputRouteRecipient>[];
  readonly ownerDefaults: readonly InternalInputActivationLease<InternalInputDefaultRecipient>[];
  readonly applicationDefaults: readonly InternalInputActivationLease<InternalInputDefaultRecipient>[];
  readonly external: InternalInputActivationLease<InternalInputExternalRecipient> | undefined;
  dependencies: readonly AnyLease[];
  releaseInputDemand: (() => void) | undefined;
}

/** Captured without calling application code when one framed input fact begins. */
export interface InternalInputTopologySnapshot {
  readonly selection: SelectionGeneration | undefined;
  readonly frameworkDefaults: readonly InternalInputActivationLease<InternalInputDefaultRecipient>[];
}

export interface InternalInputTopologyResolution {
  /** `stale` deliberately fails closed instead of selecting the replacement. */
  readonly kind: "compatibility" | "selected" | "stale";
  readonly candidate: InternalInputRouteCandidate;
}

export interface InternalInputRoutingRuntime {
  registerSemantic(
    recipient: InternalInputRouteRecipient,
  ): InternalInputActivationRegistration<InternalInputRouteRecipient>;
  registerDefault(
    recipient: InternalInputDefaultRecipient,
  ): InternalInputActivationRegistration<InternalInputDefaultRecipient>;
  registerExternal(
    recipient: InternalInputExternalRecipient,
  ): InternalInputActivationRegistration<InternalInputExternalRecipient>;
  /** Atomically replace the already-selected boundary and supplied focus path. */
  select(selection: InternalInputTopologySelection): () => void;
  capture(): InternalInputTopologySnapshot;
  /** Resolve every captured lease once, before the first recipient callback. */
  resolve(snapshot: InternalInputTopologySnapshot): InternalInputTopologyResolution;
  clear(): void;
}

/** Private host bridge for one selected topology's physical input ownership. */
export interface InternalInputRoutingDemandHost {
  /** Acquire one demand; the returned idempotent release must not throw. */
  acquire(): () => void;
}

type AnyRecipient =
  | InternalInputRouteRecipient
  | InternalInputDefaultRecipient
  | InternalInputExternalRecipient;
type AnyLease = InternalInputActivationLease<AnyRecipient>;

const freezeList = <Value>(values: readonly Value[] | undefined): readonly Value[] =>
  Object.freeze([...(values ?? [])]);

/**
 * Private live bridge between fact-start route ownership and the pure F3 policy.
 * It accepts an already-selected topology; it never discovers focus or modal state.
 */
export function createInternalInputRoutingRuntime(
  frameworkDefaults: readonly InternalInputDefaultRecipient[] = [],
  inputDemandHost?: InternalInputRoutingDemandHost,
): InternalInputRoutingRuntime {
  const owner = Symbol("vue-tui:input-routing-runtime");
  const states = new Set<ActivationState<AnyRecipient>>();
  let currentSelection: SelectionGeneration | undefined;
  let selectionRevision = 0;

  const releaseInputDemandSafely = (releaseInputDemand: (() => void) | undefined): void => {
    try {
      releaseInputDemand?.();
    } catch {
      // Input release is terminal cleanup. A hostile private host must not leave
      // a published replacement without a disposer or abort the rest of clear().
    }
  };

  const releaseSelectionDemand = (selection: SelectionGeneration): void => {
    const releaseInputDemand = selection.releaseInputDemand;
    selection.releaseInputDemand = undefined;
    for (const lease of selection.applicationGlobal) {
      lease[activationState].globalSelections.delete(selection);
    }
    releaseInputDemandSafely(releaseInputDemand);
  };

  const hasActiveApplicationGlobal = (selection: SelectionGeneration): boolean =>
    selection.applicationGlobal.some((lease) => lease[activationState].active);

  const deactivateSelection = (selection: SelectionGeneration, endWholeSelection = false): void => {
    if (selection.active) {
      selection.active = false;
      for (const lease of selection.dependencies) {
        lease[activationState].dependentSelections.delete(selection);
      }
    }
    if (endWholeSelection || !hasActiveApplicationGlobal(selection)) {
      releaseSelectionDemand(selection);
    }
  };

  const register = <Value extends AnyRecipient>(
    kind: ActivationState<Value>["kind"],
    value: Value,
  ): InternalInputActivationRegistration<Value> => {
    const state: ActivationState<Value> = {
      owner,
      kind,
      value,
      active: true,
      dependentSelections: new Set(),
      globalSelections: new Set(),
    };
    states.add(state as ActivationState<AnyRecipient>);
    const lease = Object.freeze({ [activationState]: state });
    return Object.freeze({
      lease,
      end() {
        if (!state.active) return;
        state.active = false;
        states.delete(state as ActivationState<AnyRecipient>);
        for (const selection of state.dependentSelections) deactivateSelection(selection);
        state.dependentSelections.clear();
        for (const selection of state.globalSelections) {
          if (!selection.active && !hasActiveApplicationGlobal(selection)) {
            releaseSelectionDemand(selection);
          }
        }
        state.globalSelections.clear();
      },
    });
  };

  const frameworkDefaultRegistrations = frameworkDefaults.map((recipient) =>
    register("default", recipient),
  );
  const frameworkDefaultLeases = Object.freeze(
    frameworkDefaultRegistrations.map((registration) => registration.lease),
  );

  const stateFor = <Value extends AnyRecipient>(
    lease: InternalInputActivationLease<Value>,
    expectedKind: ActivationState<Value>["kind"],
  ): ActivationState<Value> => {
    const state = lease[activationState];
    if (state.owner !== owner) {
      throw new Error("Input route lease belongs to a different application");
    }
    if (state.kind !== expectedKind) {
      throw new Error(`Expected a ${expectedKind} input route lease, received ${state.kind}`);
    }
    return state;
  };

  const semanticState = (lease: InternalInputActivationLease<InternalInputRouteRecipient>) =>
    stateFor(lease, "semantic");
  const defaultState = (lease: InternalInputActivationLease<InternalInputDefaultRecipient>) =>
    stateFor(lease, "default");
  const externalState = (lease: InternalInputActivationLease<InternalInputExternalRecipient>) =>
    stateFor(lease, "external");
  const requireActive = <Value>(state: ActivationState<Value>): void => {
    if (!state.active) throw new Error("Cannot select an ended input route lease");
  };

  const validateSelection = (selection: SelectionGeneration): readonly AnyLease[] => {
    for (const lease of selection.applicationGlobal) requireActive(semanticState(lease));
    const selectedSemantic = [
      selection.activeBoundary,
      selection.focusedOwner,
      ...selection.logicalAncestors,
    ].filter((lease): lease is InternalInputActivationLease<InternalInputRouteRecipient> =>
      Boolean(lease),
    );
    for (const lease of selectedSemantic) requireActive(semanticState(lease));
    for (const lease of [...selection.ownerDefaults, ...selection.applicationDefaults]) {
      requireActive(defaultState(lease));
    }
    if (selection.external) requireActive(externalState(selection.external));

    // Globals are independent. Every selected-path lease makes this complete
    // generation stale when it ends, so a vanished modal cannot expose PTY.
    return Object.freeze([
      ...selectedSemantic,
      ...selection.ownerDefaults,
      ...selection.applicationDefaults,
      ...(selection.external ? [selection.external] : []),
    ]);
  };

  const activeValue = <Value extends AnyRecipient>(
    lease: InternalInputActivationLease<Value> | undefined,
    expectedKind: ActivationState<Value>["kind"],
  ): Value | undefined => {
    if (!lease) return undefined;
    const state = stateFor(lease, expectedKind);
    return state.active ? state.value : undefined;
  };

  const activeValues = <Value extends AnyRecipient>(
    leases: readonly InternalInputActivationLease<Value>[],
    expectedKind: ActivationState<Value>["kind"],
  ): readonly Value[] =>
    Object.freeze(
      leases.flatMap((lease) => {
        const value = activeValue(lease, expectedKind);
        return value ? [value] : [];
      }),
    );

  return {
    registerSemantic(recipient) {
      return register("semantic", recipient);
    },
    registerDefault(recipient) {
      return register("default", recipient);
    },
    registerExternal(recipient) {
      return register("external", recipient);
    },
    select(selection) {
      const next: SelectionGeneration = {
        active: true,
        applicationGlobal: freezeList(selection.applicationGlobal),
        activeBoundary: selection.activeBoundary,
        focusedOwner: selection.focusedOwner,
        logicalAncestors: freezeList(selection.logicalAncestors),
        ownerDefaults: freezeList(selection.ownerDefaults),
        applicationDefaults: freezeList(selection.applicationDefaults),
        external: selection.external,
        dependencies: Object.freeze([]),
        releaseInputDemand: undefined,
      };

      // Validate ownership and kinds before invalidating the current generation.
      next.dependencies = validateSelection(next);
      const observedRevision = selectionRevision;

      // Acquire the replacement's input lease before publishing it or releasing
      // the previous generation. This keeps raw mode and the shared listener
      // continuous across route replacement. Input synchronously produced by
      // acquisition still belongs to the previously published snapshot.
      const releaseInputDemand = inputDemandHost?.acquire();
      if (observedRevision !== selectionRevision) {
        // A re-entrant select/clear is the later intent. Do not let the outer
        // operation overwrite it after its host callback returns.
        releaseInputDemandSafely(releaseInputDemand);
        return () => {};
      }
      try {
        // A hostile host callback may synchronously end one of the proposed
        // leases. Revalidate before publishing a route that could never own input.
        next.dependencies = validateSelection(next);
      } catch (error) {
        releaseInputDemandSafely(releaseInputDemand);
        throw error;
      }
      next.releaseInputDemand = releaseInputDemand;

      const previous = currentSelection;
      currentSelection = next;
      selectionRevision++;
      for (const lease of next.dependencies) {
        lease[activationState].dependentSelections.add(next);
      }
      for (const lease of next.applicationGlobal) {
        lease[activationState].globalSelections.add(next);
      }
      if (previous) deactivateSelection(previous, true);

      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        if (currentSelection === next) {
          selectionRevision++;
          currentSelection = undefined;
        }
        deactivateSelection(next, true);
      };
    },
    capture() {
      return Object.freeze({
        selection: currentSelection,
        frameworkDefaults: frameworkDefaultLeases,
      });
    },
    resolve(snapshot) {
      const selection = snapshot.selection;
      if (!selection) {
        return Object.freeze({
          kind: "compatibility" as const,
          candidate: Object.freeze({
            applicationDefaults: activeValues(snapshot.frameworkDefaults, "default"),
          }),
        });
      }

      const applicationGlobal = activeValues(selection.applicationGlobal, "semantic");
      if (!selection.active) {
        return Object.freeze({
          kind: "stale" as const,
          candidate: Object.freeze({ applicationGlobal }),
        });
      }

      const selectedApplicationDefaults = activeValues(selection.applicationDefaults, "default");
      const resolvedFrameworkDefaults = activeValues(snapshot.frameworkDefaults, "default");
      return Object.freeze({
        kind: "selected" as const,
        candidate: Object.freeze({
          applicationGlobal,
          activeBoundary: activeValue(selection.activeBoundary, "semantic"),
          focusedOwner: activeValue(selection.focusedOwner, "semantic"),
          logicalAncestors: activeValues(selection.logicalAncestors, "semantic"),
          ownerDefaults: activeValues(selection.ownerDefaults, "default"),
          applicationDefaults: Object.freeze([
            ...selectedApplicationDefaults,
            ...resolvedFrameworkDefaults,
          ]),
          external: activeValue(selection.external, "external"),
        }),
      });
    },
    clear() {
      selectionRevision++;
      const selected = currentSelection;
      currentSelection = undefined;
      if (selected) deactivateSelection(selected, true);
      for (const state of states) {
        state.active = false;
        for (const selection of state.dependentSelections) deactivateSelection(selection);
        state.dependentSelections.clear();
        for (const selection of state.globalSelections) {
          releaseSelectionDemand(selection);
        }
        state.globalSelections.clear();
      }
      states.clear();
    },
  };
}
