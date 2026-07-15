import { readonly, shallowRef, watch, type ShallowRef } from "vue";
import type {
  InternalFocusController,
  InternalFocusTargetHandle,
} from "../focus/focus-controller.ts";
import type { TuiNode } from "../host/nodes.ts";
import type {
  InternalCellPoint,
  InternalCellRect,
  InternalElementGeometry,
  InternalGeometryPaintFrame,
} from "../geometry/geometry-service.ts";
import type { CaretHiddenReason, CaretState } from "../composables/useCaret.ts";
import { changeRuntimeResource } from "../resource-tracker.ts";

export interface InternalCaretRegistration {
  readonly state: Readonly<ShallowRef<CaretState>>;
  updatePosition(position: unknown): void;
  updateGeometry(geometry: InternalElementGeometry, target: TuiNode | null): void;
  dispose(): void;
}

export interface InternalPreparedCaretFrame {
  /** Candidate render-surface position for the frame being written. */
  readonly position: InternalCellPoint | undefined;
  /** Restore this declaration if writing the candidate frame fails. */
  readonly previousPosition: InternalCellPoint | undefined;
  /** Whether the writer declaration differs from the last successfully written point. */
  readonly shouldStage: boolean;
  /** Accept the candidate only after the frame and its geometry were committed. */
  accept(): void;
  discard(): void;
}

export interface InternalCaretController {
  /** Last successfully written render-surface declaration used by coordinated output replay. */
  readonly writerPosition: InternalCellPoint | undefined;
  register(focus: InternalFocusTargetHandle, initialPosition: unknown): InternalCaretRegistration;
  prepareFrame(
    frame: InternalGeometryPaintFrame,
    options?: { readonly outputAvailable?: boolean },
  ): InternalPreparedCaretFrame;
  setOutputAvailable(available: boolean, options?: { readonly surfaceReleased?: boolean }): void;
  dispose(): void;
}

export interface InternalCaretFocusAuthority {
  readonly effectiveTarget: Readonly<ShallowRef<InternalFocusTargetHandle | null>>;
  registerTargetDependent: InternalFocusController["registerTargetDependent"];
}

interface CreateInternalCaretControllerOptions {
  readonly focus: InternalCaretFocusAuthority;
  readonly outputAvailable: boolean;
  readonly requestPaint: () => void;
}

interface Owner {
  readonly focus: InternalFocusTargetHandle;
  readonly stateRef: ShallowRef<CaretState>;
  position: InternalCellPoint | null;
  invalidPosition: boolean;
  geometry: InternalElementGeometry;
  target: TuiNode | null;
  focusHost: TuiNode | null;
  intentRevision: number;
  acceptedIntentRevision: number;
  stopFocusDependency: (() => void) | null;
  disposed: boolean;
}

interface PreparedFrameState {
  readonly token: symbol;
  readonly registryRevision: number;
  readonly owner: Owner | null;
  readonly ownerIntentRevision: number;
  readonly effectiveFocus: InternalFocusTargetHandle | null;
  readonly outputAvailable: boolean;
  readonly surfaceRevision: number;
  readonly position: InternalCellPoint | undefined;
  readonly previousPosition: InternalCellPoint | undefined;
  settled: boolean;
}

const UNAVAILABLE = Object.freeze({ status: "unavailable" as const });
const INACTIVE = Object.freeze({ status: "inactive" as const });
const HIDDEN = Object.freeze(
  Object.fromEntries(
    (
      [
        "unavailable",
        "detached",
        "pending",
        "hidden",
        "clipped",
        "outside",
        "invalid-position",
        "unrelated",
      ] as const
    ).map((reason) => [reason, Object.freeze({ status: "hidden" as const, reason })]),
  ) as Record<CaretHiddenReason, Readonly<{ status: "hidden"; reason: CaretHiddenReason }>>,
);

const DETACHED_GEOMETRY = Object.freeze({ status: "detached" as const });

function isCellPoint(value: unknown): value is InternalCellPoint {
  if (typeof value !== "object" || value === null) return false;
  const point = value as { x?: unknown; y?: unknown };
  return (
    Number.isSafeInteger(point.x) &&
    Number.isSafeInteger(point.y) &&
    (point.x as number) >= 0 &&
    (point.y as number) >= 0
  );
}

function clonePoint(value: InternalCellPoint): InternalCellPoint {
  return Object.freeze({ x: value.x, y: value.y });
}

function initialPoint(value: unknown): InternalCellPoint | null {
  if (value === null || value === undefined) return null;
  if (!isCellPoint(value)) {
    throw new TypeError(
      "useCaret() position must resolve to null, undefined, or non-negative safe-integer x and y cells",
    );
  }
  return clonePoint(value);
}

function pointsEqual(
  left: InternalCellPoint | undefined,
  right: InternalCellPoint | undefined,
): boolean {
  return left?.x === right?.x && left?.y === right?.y;
}

function statesEqual(left: CaretState, right: CaretState): boolean {
  if (left.status !== right.status) return false;
  if (left.status === "hidden" && right.status === "hidden") return left.reason === right.reason;
  if (left.status === "visible" && right.status === "visible") {
    return pointsEqual(left.surface, right.surface);
  }
  return true;
}

function contains(rect: InternalCellRect, point: InternalCellPoint): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}

function isInSubtree(node: TuiNode, ancestor: TuiNode): boolean {
  for (let current: TuiNode | null = node; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

function mapBoxPoint(
  geometry: Exclude<
    InternalElementGeometry,
    | { readonly status: "unavailable" }
    | { readonly status: "detached" }
    | { readonly status: "pending" }
    | { readonly status: "hidden" }
  >,
  position: InternalCellPoint,
): CaretState {
  const fragment = geometry.fragments.find((candidate) => contains(candidate.local, position));
  if (!fragment) return HIDDEN.outside;
  const surface = clonePoint({
    x: fragment.surface.x + position.x - fragment.local.x,
    y: fragment.surface.y + position.y - fragment.local.y,
  });
  if (!fragment.visibleSurface || !contains(fragment.visibleSurface, surface)) {
    return HIDDEN.clipped;
  }
  return Object.freeze({ status: "visible", surface });
}

function mapTextPoint(
  geometry: Exclude<
    InternalElementGeometry,
    | { readonly status: "unavailable" }
    | { readonly status: "detached" }
    | { readonly status: "pending" }
    | { readonly status: "hidden" }
  >,
  position: InternalCellPoint,
): CaretState {
  if (geometry.caretSlots === null) return HIDDEN.unavailable;
  const slot = geometry.caretSlots.find(
    (candidate) => candidate.local.x === position.x && candidate.local.y === position.y,
  );
  if (!slot) return HIDDEN.outside;
  if (!slot.visible) return HIDDEN.clipped;
  return Object.freeze({ status: "visible", surface: clonePoint(slot.surface) });
}

function resolvedState(input: {
  readonly owner: Owner;
  readonly effectiveFocus: InternalFocusTargetHandle | null;
  readonly outputAvailable: boolean;
  readonly geometry: InternalElementGeometry;
  readonly requireAcceptedIntent: boolean;
}): CaretState {
  const { owner, geometry } = input;
  if (owner.disposed) return INACTIVE;
  if (owner.invalidPosition) return HIDDEN["invalid-position"];
  if (!input.outputAvailable) return UNAVAILABLE;
  if (owner.focus !== input.effectiveFocus || owner.position === null) return INACTIVE;
  if (geometry.status === "unavailable") return HIDDEN.unavailable;
  if (geometry.status === "detached") return HIDDEN.detached;
  if (geometry.status === "pending") return HIDDEN.pending;
  if (geometry.status === "hidden") return HIDDEN.hidden;
  if (geometry.status === "fully-clipped") return HIDDEN.clipped;
  if (input.requireAcceptedIntent && owner.acceptedIntentRevision !== owner.intentRevision) {
    return HIDDEN.pending;
  }
  if (!owner.target || !owner.focusHost) return HIDDEN.pending;
  if (!isInSubtree(owner.target, owner.focusHost)) return HIDDEN.unrelated;
  if (owner.target.type === "tui-box") return mapBoxPoint(geometry, owner.position);
  return mapTextPoint(geometry, owner.position);
}

function statePosition(state: CaretState): InternalCellPoint | undefined {
  return state.status === "visible" ? state.surface : undefined;
}

export function createInternalCaretController(
  options: CreateInternalCaretControllerOptions,
): InternalCaretController {
  const owners = new Map<InternalFocusTargetHandle, Owner>();
  let outputAvailable = options.outputAvailable;
  let disposed = false;
  let registryRevision = 0;
  let surfaceRevision = 0;
  let activeFrame: PreparedFrameState | null = null;
  let acceptedWriterPosition: InternalCellPoint | undefined;

  const publish = (owner: Owner, state: CaretState): void => {
    if (!statesEqual(owner.stateRef.value, state)) owner.stateRef.value = state;
  };

  const refresh = (requestIfPositionChanged = true): void => {
    const effectiveFocus = options.focus.effectiveTarget.value;
    for (const owner of owners.values()) {
      publish(
        owner,
        resolvedState({
          owner,
          effectiveFocus,
          outputAvailable,
          geometry: owner.geometry,
          requireAcceptedIntent: true,
        }),
      );
    }
    const selected = effectiveFocus ? owners.get(effectiveFocus) : undefined;
    const nextPosition = selected ? statePosition(selected.stateRef.value) : undefined;
    const changed = !pointsEqual(acceptedWriterPosition, nextPosition);
    if (changed && requestIfPositionChanged && !activeFrame) options.requestPaint();
  };

  const invalidateOwnerIntent = (owner: Owner): void => {
    owner.intentRevision++;
    registryRevision++;
  };

  const disposeOwner = (owner: Owner, fromFocus: boolean): void => {
    if (owner.disposed) return;
    owner.disposed = true;
    registryRevision++;
    if (owners.get(owner.focus) === owner) {
      owners.delete(owner.focus);
      changeRuntimeResource("caretOwners", -1);
    }
    const stop = owner.stopFocusDependency;
    owner.stopFocusDependency = null;
    if (!fromFocus) stop?.();
    owner.target = null;
    owner.focusHost = null;
    owner.geometry = DETACHED_GEOMETRY;
    publish(owner, INACTIVE);
    refresh();
    options.requestPaint();
  };

  const stopEffectiveFocus = watch(
    options.focus.effectiveTarget,
    (next, previous) => {
      if (disposed || next === previous) return;
      registryRevision++;
      const nextOwner = next ? owners.get(next) : undefined;
      if (nextOwner) nextOwner.intentRevision++;
      refresh();
      options.requestPaint();
    },
    { flush: "sync" },
  );

  const controller: InternalCaretController = {
    get writerPosition() {
      return acceptedWriterPosition;
    },
    register(focus, rawInitialPosition) {
      if (disposed) throw new Error("Caret controller is disposed");
      const position = initialPoint(rawInitialPosition);
      if (owners.has(focus)) throw new Error("Focus target already has a live caret owner");

      const owner: Owner = {
        focus,
        stateRef: shallowRef<CaretState>(INACTIVE),
        position,
        invalidPosition: false,
        geometry: DETACHED_GEOMETRY,
        target: null,
        focusHost: null,
        intentRevision: 0,
        acceptedIntentRevision: -1,
        stopFocusDependency: null,
        disposed: false,
      };
      let registered = false;
      try {
        owner.stopFocusDependency = options.focus.registerTargetDependent(focus, {
          hostChanged(host) {
            if (owner.disposed || owner.focusHost === host) return;
            owner.focusHost = host;
            if (registered) {
              invalidateOwnerIntent(owner);
              refresh();
            }
          },
          disposed() {
            disposeOwner(owner, true);
          },
        });
        owners.set(focus, owner);
        changeRuntimeResource("caretOwners", 1);
        registered = true;
        registryRevision++;
        refresh(false);
      } catch (error) {
        owner.stopFocusDependency?.();
        owner.stopFocusDependency = null;
        if (owners.get(focus) === owner) {
          owners.delete(focus);
          changeRuntimeResource("caretOwners", -1);
        }
        owner.disposed = true;
        throw error;
      }

      const registration: InternalCaretRegistration = {
        state: readonly(owner.stateRef) as Readonly<ShallowRef<CaretState>>,
        updatePosition(rawPosition) {
          if (owner.disposed) return;
          const wasInvalid = owner.invalidPosition;
          const previous = owner.position;
          if (rawPosition === null || rawPosition === undefined) {
            owner.position = null;
            owner.invalidPosition = false;
          } else if (!isCellPoint(rawPosition)) {
            owner.position = null;
            owner.invalidPosition = true;
          } else {
            owner.position = clonePoint(rawPosition);
            owner.invalidPosition = false;
          }
          const unchanged =
            wasInvalid === owner.invalidPosition &&
            (previous === null
              ? owner.position === null
              : owner.position !== null && pointsEqual(previous, owner.position));
          if (unchanged) return;
          invalidateOwnerIntent(owner);
          refresh();
          options.requestPaint();
        },
        updateGeometry(geometry, target) {
          if (owner.disposed) return;
          const targetChanged = owner.target !== target;
          owner.geometry = geometry;
          owner.target = target;
          if (targetChanged) invalidateOwnerIntent(owner);
          refresh();
          if (geometry.status === "pending" || targetChanged) options.requestPaint();
        },
        dispose() {
          disposeOwner(owner, false);
        },
      };
      return registration;
    },
    prepareFrame(frame, frameOptions = {}) {
      if (disposed) throw new Error("Caret controller is disposed");
      if (activeFrame) throw new Error("A caret paint frame is already active");
      const effectiveFocus = options.focus.effectiveTarget.value;
      const owner = effectiveFocus ? (owners.get(effectiveFocus) ?? null) : null;
      const frameOutputAvailable = frameOptions.outputAvailable ?? outputAvailable;
      let state: CaretState = INACTIVE;
      if (owner) {
        const geometry = owner.target ? frame.geometryFor(owner.target) : owner.geometry;
        state = resolvedState({
          owner,
          effectiveFocus,
          outputAvailable: frameOutputAvailable,
          geometry,
          requireAcceptedIntent: false,
        });
      }
      const prepared: PreparedFrameState = {
        token: Symbol("caret-frame"),
        registryRevision,
        owner,
        ownerIntentRevision: owner?.intentRevision ?? -1,
        effectiveFocus,
        outputAvailable: frameOutputAvailable,
        surfaceRevision,
        position: statePosition(state),
        previousPosition: acceptedWriterPosition,
        settled: false,
      };
      activeFrame = prepared;

      const settle = (): boolean => {
        if (prepared.settled) return false;
        prepared.settled = true;
        if (activeFrame === prepared) activeFrame = null;
        return true;
      };
      return Object.freeze({
        position: prepared.position,
        previousPosition: prepared.previousPosition,
        shouldStage: !pointsEqual(prepared.position, prepared.previousPosition),
        accept() {
          if (!settle()) return;
          const unchanged =
            !disposed &&
            registryRevision === prepared.registryRevision &&
            options.focus.effectiveTarget.value === prepared.effectiveFocus &&
            (!prepared.owner ||
              (!prepared.owner.disposed &&
                prepared.owner.intentRevision === prepared.ownerIntentRevision));
          if (unchanged) {
            outputAvailable = prepared.outputAvailable;
            if (prepared.owner) {
              prepared.owner.acceptedIntentRevision = prepared.owner.intentRevision;
            }
          }
          if (prepared.surfaceRevision === surfaceRevision) {
            acceptedWriterPosition = prepared.position ? clonePoint(prepared.position) : undefined;
          }
          refresh(false);
          const selected = options.focus.effectiveTarget.value;
          const selectedOwner = selected ? owners.get(selected) : undefined;
          const desiredPosition = selectedOwner
            ? statePosition(selectedOwner.stateRef.value)
            : undefined;
          if (!unchanged || !pointsEqual(acceptedWriterPosition, desiredPosition)) {
            options.requestPaint();
          }
        },
        discard() {
          if (!settle()) return;
          refresh(false);
          const selected = options.focus.effectiveTarget.value;
          const selectedOwner = selected ? owners.get(selected) : undefined;
          const desiredPosition = selectedOwner
            ? statePosition(selectedOwner.stateRef.value)
            : undefined;
          if (
            !pointsEqual(prepared.position, prepared.previousPosition) ||
            !pointsEqual(acceptedWriterPosition, desiredPosition)
          ) {
            options.requestPaint();
          }
        },
      });
    },
    setOutputAvailable(available, availabilityOptions = {}) {
      if (disposed) return;
      if (availabilityOptions.surfaceReleased) {
        surfaceRevision++;
        registryRevision++;
        acceptedWriterPosition = undefined;
      }
      if (outputAvailable === available) return;
      outputAvailable = available;
      if (!availabilityOptions.surfaceReleased) registryRevision++;
      refresh(!availabilityOptions.surfaceReleased);
      if (available) options.requestPaint();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopEffectiveFocus();
      activeFrame = null;
      for (const owner of owners.values()) disposeOwner(owner, false);
      owners.clear();
      acceptedWriterPosition = undefined;
    },
  };

  return controller;
}
