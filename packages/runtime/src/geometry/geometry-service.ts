import { shallowRef, type ShallowRef } from "vue";
import type { AppContext } from "../context.ts";
import type { TuiBox, TuiNode } from "../host/nodes.ts";
import type { RenderedTargetTransactionHost } from "../rendered-target.ts";
import { changeRuntimeResource } from "../resource-tracker.ts";

export type InternalBoxSizeState =
  | { readonly status: "unavailable" }
  | { readonly status: "detached" }
  | { readonly status: "pending" }
  | { readonly status: "hidden" }
  | {
      readonly status: "resolved";
      readonly width: number;
      readonly height: number;
      readonly left: number;
      readonly top: number;
    };

export interface InternalBoxSizeBinding {
  readonly state: Readonly<ShallowRef<InternalBoxSizeState>>;
  observe(observer: (state: InternalBoxSizeState, target: TuiBox | null) => void): () => void;
  attach(target: TuiBox): () => void;
  dispose(): void;
}

export interface InternalGeometryPaintFrame {
  /** True when this target or one of its descendants was observed at frame start. */
  hasObservedSubtree(target: TuiNode): boolean;
  record(target: TuiBox, width: number, height: number, left: number, top: number): void;
  recordSubtree(target: TuiNode, status: "hidden" | "unavailable"): void;
  commit(): void;
  discard(): void;
}

export interface InternalGeometryService extends RenderedTargetTransactionHost {
  createBinding(): InternalBoxSizeBinding;
  beginFrame(): InternalGeometryPaintFrame;
  setSurfaceAvailable(available: boolean): void;
  invalidateSurface(): void;
  dispose(): void;
}

const UNAVAILABLE = Object.freeze({ status: "unavailable" as const });
const DETACHED = Object.freeze({ status: "detached" as const });
const PENDING = Object.freeze({ status: "pending" as const });
const HIDDEN = Object.freeze({ status: "hidden" as const });

function resolved(width: number, height: number, left: number, top: number): InternalBoxSizeState {
  return Object.freeze({ status: "resolved" as const, width, height, left, top });
}

interface MutableBinding {
  readonly state: ShallowRef<InternalBoxSizeState>;
  readonly observers: Set<(state: InternalBoxSizeState, target: TuiBox | null) => void>;
  target: TuiBox | null;
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
  for (let current: TuiNode | null = node; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

export function createInternalGeometryService(
  requestPaint: () => void = () => {},
): InternalGeometryService {
  const bindings = new Set<MutableBinding>();
  const queued = new Map<MutableBinding, InternalBoxSizeState>();
  let transactionDepth = 0;
  let surfaceAvailable = true;
  let disposed = false;

  const detachedState = (): InternalBoxSizeState => (surfaceAvailable ? DETACHED : UNAVAILABLE);

  const assign = (binding: MutableBinding, state: InternalBoxSizeState): void => {
    if (binding.state.value === state) return;
    binding.state.value = state;
    for (const observer of binding.observers) observer(state, binding.target);
  };

  const publish = (binding: MutableBinding, state: InternalBoxSizeState): void => {
    if (!binding.active) return;
    if (transactionDepth > 0) queued.set(binding, state);
    else assign(binding, state);
  };

  const flush = (): void => {
    if (transactionDepth > 0 || queued.size === 0) return;
    for (const [binding, state] of queued) {
      if (binding.active) assign(binding, state);
    }
    queued.clear();
  };

  const service: InternalGeometryService = {
    createBinding() {
      if (disposed) throw new Error("geometry service is disposed");
      const binding: MutableBinding = {
        state: shallowRef<InternalBoxSizeState>(detachedState()),
        observers: new Set(),
        target: null,
        active: true,
      };
      bindings.add(binding);
      changeRuntimeResource("geometryBindings", 1);
      return {
        state: binding.state,
        observe(observer) {
          if (!binding.active) throw new Error("geometry binding is disposed");
          binding.observers.add(observer);
          try {
            observer(binding.state.value, binding.target);
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
          binding.target = target;
          publish(binding, surfaceAvailable ? PENDING : UNAVAILABLE);
          if (surfaceAvailable) requestPaint();
          let attached = true;
          return () => {
            if (!attached) return;
            attached = false;
            if (binding.target !== target) return;
            binding.target = null;
            publish(binding, detachedState());
          };
        },
        dispose() {
          if (!binding.active) return;
          binding.target = null;
          assign(binding, DETACHED);
          binding.active = false;
          bindings.delete(binding);
          queued.delete(binding);
          binding.observers.clear();
          changeRuntimeResource("geometryBindings", -1);
        },
      };
    },
    beginFrame() {
      if (disposed) throw new Error("geometry service is disposed");
      const records = new Map<TuiBox, InternalBoxSizeState>();
      const observedTargets = new Set<TuiBox>();
      const observedSubtrees = new Set<TuiNode>();
      for (const binding of bindings) {
        if (!binding.target) continue;
        observedTargets.add(binding.target);
        for (let current: TuiNode | null = binding.target; current; current = current.parent) {
          observedSubtrees.add(current);
        }
      }
      let settled = false;
      return {
        hasObservedSubtree(target) {
          return observedSubtrees.has(target);
        },
        record(target, width, height, left, top) {
          if (settled) throw new Error("geometry paint frame is already settled");
          if (observedTargets.has(target)) records.set(target, resolved(width, height, left, top));
        },
        recordSubtree(target, status) {
          if (settled) throw new Error("geometry paint frame is already settled");
          const state = status === "hidden" ? HIDDEN : UNAVAILABLE;
          for (const observed of observedTargets) {
            if (belongsToSubtree(observed, target)) records.set(observed, state);
          }
        },
        commit() {
          if (settled) throw new Error("geometry paint frame is already settled");
          settled = true;
          if (!surfaceAvailable || disposed) return;
          transactionDepth++;
          try {
            for (const binding of bindings) {
              if (binding.target) publish(binding, records.get(binding.target) ?? PENDING);
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
          if (binding.target && binding.state.value.status !== "unavailable") {
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
      queued.clear();
    },
  };

  return service;
}
