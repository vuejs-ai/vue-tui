import { shallowRef, type ShallowRef } from "vue";
import type { AppContext } from "../context.ts";
import { isContainer, type TuiNode, type TuiRoot } from "../host/nodes.ts";
import type { RenderedTargetTransactionHost } from "../rendered-target.ts";

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
  readonly visible: InternalCellRect | null;
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
      readonly status: "zero-size" | "clipped" | "visible";
    });

export interface InternalGeometryBinding {
  readonly geometry: Readonly<ShallowRef<InternalElementGeometry>>;
  attach(target: TuiNode): () => void;
  dispose(): void;
}

export interface InternalGeometryPaintFrame {
  readonly generation: number;
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
      visible: fragment.visible ? freezeRect(fragment.visible) : null,
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

  const publish = (binding: MutableBinding, geometry: InternalElementGeometry): void => {
    if (!binding.active) return;
    const frozen = freezeInternalGeometry(geometry);
    if (transactionDepth > 0) queued.set(binding, frozen);
    else binding.value.value = frozen;
  };

  const flush = (): void => {
    if (transactionDepth > 0 || queued.size === 0) return;
    for (const [binding, geometry] of queued) {
      if (binding.active) binding.value.value = geometry;
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
        value: shallowRef<InternalElementGeometry>(DETACHED),
        target: null,
        active: true,
      };
      bindings.add(binding);
      return {
        geometry: binding.value,
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
            publish(binding, DETACHED);
          };
        },
        dispose() {
          if (!binding.active) return;
          if (binding.target) unlink(binding, binding.target);
          binding.target = null;
          binding.active = false;
          bindings.delete(binding);
          queued.delete(binding);
          binding.value.value = DETACHED;
        },
      };
    },
    beginFrame() {
      if (disposed) throw new Error("geometry service is disposed");
      const generation = currentGeneration + 1;
      const records = new Map<TuiNode, InternalElementGeometry>();
      let settled = false;
      const recordSubtree = (target: TuiNode, status: "hidden" | "unavailable"): void => {
        records.set(target, status === "hidden" ? HIDDEN : UNAVAILABLE);
        if (isContainer(target)) {
          for (const child of target.children) recordSubtree(child, status);
        }
      };
      return {
        generation,
        record(target, geometry) {
          if (settled) throw new Error("geometry paint frame is already settled");
          records.set(target, freezeInternalGeometry(geometry));
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
              publish(binding, records.get(binding.target) ?? PENDING);
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
          if (binding.target) publish(binding, available ? PENDING : UNAVAILABLE);
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
          publish(binding, DETACHED);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const binding of bindings) {
        binding.target = null;
        binding.active = false;
        binding.value.value = DETACHED;
      }
      bindings.clear();
      bindingsByTarget.clear();
      queued.clear();
    },
  };

  return service;
}
