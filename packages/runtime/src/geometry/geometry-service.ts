import { shallowRef, type ShallowRef } from "vue";
import type { AppContext } from "../context.ts";
import type { TuiNode, TuiRoot } from "../host/nodes.ts";
import type { RenderedTargetTransactionHost } from "../rendered-target.ts";
import { changeRuntimeResource } from "../resource-tracker.ts";

export interface InternalCellPoint {
  readonly x: number;
  readonly y: number;
}

export interface InternalCellRect extends InternalCellPoint {
  readonly width: number;
  readonly height: number;
}

export interface InternalGeometryFragment {
  readonly local: InternalCellRect;
  readonly parent: InternalCellRect;
  readonly surface: InternalCellRect;
  readonly visibleSurface: InternalCellRect | null;
}

/** Exact legal insertion boundary. Wide-glyph continuation cells have no slot. */
export interface InternalCaretSlot {
  readonly local: InternalCellPoint;
  readonly surface: InternalCellPoint;
  readonly visible: boolean;
}

export interface InternalResolvedGeometry {
  readonly parent: InternalCellRect;
  readonly surface: InternalCellRect;
  readonly fragments: readonly InternalGeometryFragment[];
  /** null means paint cannot preserve insertion provenance for this target. */
  readonly caretSlots: readonly InternalCaretSlot[] | null;
}

export type InternalElementGeometry =
  | { readonly status: "unavailable" }
  | { readonly status: "detached" }
  | { readonly status: "pending" }
  | { readonly status: "hidden" }
  | (InternalResolvedGeometry & {
      readonly status: "zero-size" | "fully-clipped" | "visible";
    });

export interface InternalGeometryBinding {
  readonly geometry: Readonly<ShallowRef<InternalElementGeometry>>;
  observe(
    observer: (geometry: InternalElementGeometry, target: TuiNode | null) => void,
  ): () => void;
  attach(target: TuiNode): () => void;
  dispose(): void;
}

export interface InternalGeometryPaintFrame {
  readonly generation: number;
  /** True only for a target that had a live geometry binding when this frame began. */
  isObserved(target: TuiNode): boolean;
  /** True when this target or one of its descendants was observed at frame start. */
  hasObservedSubtree(target: TuiNode): boolean;
  /** Read this frame's frozen paint result without publishing the generation. */
  geometryFor(target: TuiNode): InternalElementGeometry;
  /** Paint traversal order for an observed target recorded in this frame. */
  paintOrderFor(target: TuiNode): number | undefined;
  record(target: TuiNode, geometry: InternalElementGeometry): void;
  recordSubtree(target: TuiNode, status: "hidden" | "unavailable"): void;
  commit(): void;
  discard(): void;
}

export interface InternalGeometryService extends RenderedTargetTransactionHost {
  readonly generation: number;
  createBinding(): InternalGeometryBinding;
  beginFrame(): InternalGeometryPaintFrame;
  setSurfaceAvailable(available: boolean): void;
  invalidateSurface(): void;
  dispose(): void;
}

const UNAVAILABLE = Object.freeze({ status: "unavailable" as const });
const DETACHED = Object.freeze({ status: "detached" as const });
const PENDING = Object.freeze({ status: "pending" as const });
const HIDDEN = Object.freeze({ status: "hidden" as const });

function freezeRect(rect: InternalCellRect): InternalCellRect {
  return Object.freeze({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
}

function freezePoint(point: InternalCellPoint): InternalCellPoint {
  return Object.freeze({ x: point.x, y: point.y });
}

export function freezeInternalGeometry(geometry: InternalElementGeometry): InternalElementGeometry {
  if (geometry.status === "unavailable") return UNAVAILABLE;
  if (geometry.status === "detached") return DETACHED;
  if (geometry.status === "pending") return PENDING;
  if (geometry.status === "hidden") return HIDDEN;
  const fragments = geometry.fragments.map((fragment) =>
    Object.freeze({
      local: freezeRect(fragment.local),
      parent: freezeRect(fragment.parent),
      surface: freezeRect(fragment.surface),
      visibleSurface: fragment.visibleSurface ? freezeRect(fragment.visibleSurface) : null,
    }),
  );
  const caretSlots = geometry.caretSlots?.map((slot) =>
    Object.freeze({
      local: freezePoint(slot.local),
      surface: freezePoint(slot.surface),
      visible: slot.visible,
    }),
  );
  return Object.freeze({
    status: geometry.status,
    parent: freezeRect(geometry.parent),
    surface: freezeRect(geometry.surface),
    fragments: Object.freeze(fragments),
    caretSlots: caretSlots === undefined ? null : Object.freeze(caretSlots),
  });
}

interface MutableBinding {
  readonly value: ShallowRef<InternalElementGeometry>;
  readonly observers: Set<(geometry: InternalElementGeometry, target: TuiNode | null) => void>;
  target: TuiNode | null;
  active: boolean;
}

const servicesByApp = new WeakMap<AppContext, InternalGeometryService>();

export function setInternalGeometryService(
  app: AppContext,
  service: InternalGeometryService | null,
): void {
  if (service) servicesByApp.set(app, service);
  else servicesByApp.delete(app);
}

export function getInternalGeometryService(app: AppContext): InternalGeometryService | undefined {
  return servicesByApp.get(app);
}

function belongsToSubtree(node: TuiNode, ancestor: TuiNode): boolean {
  let current: TuiNode | null = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

export function createInternalGeometryService(
  _root: TuiRoot,
  requestPaint: () => void = () => {},
): InternalGeometryService {
  const bindings = new Set<MutableBinding>();
  const bindingsByTarget = new Map<TuiNode, Set<MutableBinding>>();
  const queued = new Map<MutableBinding, InternalElementGeometry>();
  let currentGeneration = 0;
  let transactionDepth = 0;
  let surfaceAvailable = true;
  let disposed = false;

  const detachedState = (): InternalElementGeometry => (surfaceAvailable ? DETACHED : UNAVAILABLE);

  const assign = (binding: MutableBinding, geometry: InternalElementGeometry): void => {
    if (binding.value.value === geometry) return;
    binding.value.value = geometry;
    for (const observer of binding.observers) observer(geometry, binding.target);
  };

  const publishFrozen = (binding: MutableBinding, geometry: InternalElementGeometry): void => {
    if (!binding.active) return;
    if (transactionDepth > 0) queued.set(binding, geometry);
    else assign(binding, geometry);
  };

  const publish = (binding: MutableBinding, geometry: InternalElementGeometry): void => {
    publishFrozen(binding, freezeInternalGeometry(geometry));
  };

  const flush = (): void => {
    if (transactionDepth > 0 || queued.size === 0) return;
    for (const [binding, geometry] of queued) {
      if (binding.active) assign(binding, geometry);
    }
    queued.clear();
  };

  const unlink = (binding: MutableBinding, target: TuiNode): void => {
    const targetBindings = bindingsByTarget.get(target);
    targetBindings?.delete(binding);
    if (targetBindings?.size === 0) bindingsByTarget.delete(target);
  };

  const service: InternalGeometryService = {
    get generation() {
      return currentGeneration;
    },
    createBinding() {
      if (disposed) throw new Error("geometry service is disposed");
      const binding: MutableBinding = {
        value: shallowRef<InternalElementGeometry>(detachedState()),
        observers: new Set(),
        target: null,
        active: true,
      };
      bindings.add(binding);
      changeRuntimeResource("geometryBindings", 1);
      return {
        geometry: binding.value,
        observe(observer) {
          if (!binding.active) throw new Error("geometry binding is disposed");
          binding.observers.add(observer);
          try {
            observer(binding.value.value, binding.target);
          } catch (error) {
            binding.observers.delete(observer);
            throw error;
          }
          let observing = true;
          return () => {
            if (!observing) return;
            observing = false;
            binding.observers.delete(observer);
          };
        },
        attach(target) {
          if (!binding.active) throw new Error("geometry binding is disposed");
          if (binding.target && binding.target !== target) unlink(binding, binding.target);
          binding.target = target;
          let targetBindings = bindingsByTarget.get(target);
          if (!targetBindings) bindingsByTarget.set(target, (targetBindings = new Set()));
          targetBindings.add(binding);
          publish(binding, surfaceAvailable ? PENDING : UNAVAILABLE);
          if (surfaceAvailable) requestPaint();
          let attached = true;
          return () => {
            if (!attached) return;
            attached = false;
            if (binding.target !== target) return;
            unlink(binding, target);
            binding.target = null;
            publish(binding, detachedState());
          };
        },
        dispose() {
          if (!binding.active) return;
          if (binding.target) unlink(binding, binding.target);
          binding.target = null;
          assign(binding, DETACHED);
          binding.active = false;
          bindings.delete(binding);
          changeRuntimeResource("geometryBindings", -1);
          queued.delete(binding);
          binding.observers.clear();
        },
      };
    },
    beginFrame() {
      if (disposed) throw new Error("geometry service is disposed");
      const generation = currentGeneration + 1;
      const records = new Map<TuiNode, InternalElementGeometry>();
      const paintOrders = new Map<TuiNode, number>();
      let nextPaintOrder = 0;
      const observedTargets = new Set<TuiNode>();
      const observedSubtrees = new Set<TuiNode>();
      for (const binding of bindings) {
        if (!binding.target) continue;
        observedTargets.add(binding.target);
        let current: TuiNode | null = binding.target;
        while (current) {
          observedSubtrees.add(current);
          current = current.parent;
        }
      }
      let settled = false;
      const recordSubtree = (target: TuiNode, status: "hidden" | "unavailable"): void => {
        const geometry = status === "hidden" ? HIDDEN : UNAVAILABLE;
        for (const observed of observedTargets) {
          if (belongsToSubtree(observed, target)) records.set(observed, geometry);
        }
      };
      return {
        generation,
        isObserved(target) {
          return observedTargets.has(target);
        },
        hasObservedSubtree(target) {
          return observedSubtrees.has(target);
        },
        geometryFor(target) {
          if (settled) throw new Error("geometry paint frame is already settled");
          if (!observedTargets.has(target)) {
            throw new Error("geometry target was not observed when this paint frame began");
          }
          return records.get(target) ?? PENDING;
        },
        paintOrderFor(target) {
          if (settled) throw new Error("geometry paint frame is already settled");
          return paintOrders.get(target);
        },
        record(target, geometry) {
          if (settled) throw new Error("geometry paint frame is already settled");
          if (observedTargets.has(target)) {
            records.set(target, freezeInternalGeometry(geometry));
            if (!paintOrders.has(target)) paintOrders.set(target, nextPaintOrder++);
          }
        },
        recordSubtree(target, status) {
          if (settled) throw new Error("geometry paint frame is already settled");
          recordSubtree(target, status);
        },
        commit() {
          if (settled) throw new Error("geometry paint frame is already settled");
          settled = true;
          if (!surfaceAvailable || disposed) return;
          currentGeneration = generation;
          transactionDepth++;
          try {
            for (const binding of bindings) {
              if (!binding.target) continue;
              publishFrozen(binding, records.get(binding.target) ?? PENDING);
            }
          } finally {
            transactionDepth--;
            flush();
          }
        },
        discard() {
          if (settled) return;
          settled = true;
        },
      };
    },
    setSurfaceAvailable(available) {
      if (disposed || surfaceAvailable === available) return;
      surfaceAvailable = available;
      transactionDepth++;
      try {
        for (const binding of bindings) {
          publish(
            binding,
            binding.target && available ? PENDING : available ? DETACHED : UNAVAILABLE,
          );
        }
      } finally {
        transactionDepth--;
        flush();
      }
    },
    invalidateSurface() {
      if (disposed || !surfaceAvailable) return;
      transactionDepth++;
      try {
        for (const binding of bindings) {
          if (binding.target && binding.value.value.status !== "unavailable") {
            publish(binding, PENDING);
          }
        }
      } finally {
        transactionDepth--;
        flush();
      }
    },
    transaction(_kind, change) {
      transactionDepth++;
      try {
        change();
      } finally {
        transactionDepth--;
        flush();
      }
    },
    beforeInvalidateSubtree(target) {
      for (const binding of bindings) {
        if (binding.target && belongsToSubtree(binding.target, target)) {
          unlink(binding, binding.target);
          binding.target = null;
          publish(binding, detachedState());
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      changeRuntimeResource("geometryBindings", -bindings.size);
      for (const binding of bindings) {
        binding.target = null;
        assign(binding, DETACHED);
        binding.active = false;
        binding.observers.clear();
      }
      bindings.clear();
      bindingsByTarget.clear();
      queued.clear();
    },
  };

  return service;
}
