import { computed, shallowRef, type ComputedRef, type ShallowRef } from "vue";
import type { AppContext } from "../context.ts";
import type { TuiBox, TuiNode, TuiRoot } from "../host/nodes.ts";
import { changeRuntimeResource } from "../resource-tracker.ts";

interface AcceptedPresenceFrame {
  readonly generation: number;
  readonly values: WeakMap<MutableBoxPresenceBinding, boolean>;
}

interface MutableBoxPresenceBinding {
  readonly presence: ComputedRef<boolean>;
  readonly finalized: ShallowRef<boolean>;
  target: TuiBox | null;
  revision: number;
  state: "active" | "retiring" | "disposed";
}

export interface InternalBoxPresenceBinding {
  readonly presence: Readonly<ComputedRef<boolean>>;
  attach(target: TuiBox): () => void;
  dispose(): void;
}

export interface InternalBoxPresenceFrame {
  readonly generation: number;
  commit(): void;
  discard(): void;
}

export interface InternalBoxPresenceService {
  readonly generation: number;
  createBinding(): InternalBoxPresenceBinding;
  beginFrame(): InternalBoxPresenceFrame;
  dispose(): void;
}

const servicesByApp = new WeakMap<AppContext, InternalBoxPresenceService>();

export function setInternalBoxPresenceService(
  app: AppContext,
  service: InternalBoxPresenceService | null,
): void {
  if (service) servicesByApp.set(app, service);
  else servicesByApp.delete(app);
}

export function getInternalBoxPresenceService(
  app: AppContext,
): InternalBoxPresenceService | undefined {
  return servicesByApp.get(app);
}

/** Presence is logical tree membership, deliberately independent of visual geometry. */
function isPresent(root: TuiRoot, target: TuiBox): boolean {
  let current: TuiNode | null = target;
  while (current) {
    if (current.type === "tui-static") return false;
    if (current.type === "tui-box" && current.style.display === "none") return false;
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

export function createInternalBoxPresenceService(
  root: TuiRoot,
  requestCommit: () => void = () => {},
): InternalBoxPresenceService {
  const bindings = new Set<MutableBoxPresenceBinding>();
  const acceptedFrame: ShallowRef<AcceptedPresenceFrame> = shallowRef({
    generation: 0,
    values: new WeakMap(),
  });
  let currentGeneration = 0;
  let disposed = false;

  const finalize = (binding: MutableBoxPresenceBinding): void => {
    if (binding.state === "disposed") return;
    binding.state = "disposed";
    binding.target = null;
    bindings.delete(binding);
    changeRuntimeResource("boxPresenceBindings", -1);
    binding.finalized.value = true;
    // Force the lazy computed to drop its dependency on the app-wide accepted
    // frame. A retained public ref stays false without retaining the live app.
    void binding.presence.value;
  };

  const service: InternalBoxPresenceService = {
    get generation() {
      return currentGeneration;
    },
    createBinding() {
      if (disposed) throw new Error("Box-presence service is disposed");
      let binding!: MutableBoxPresenceBinding;
      const finalized = shallowRef(false);
      const presence = computed(() =>
        finalized.value ? false : (acceptedFrame.value.values.get(binding) ?? false),
      );
      binding = {
        presence,
        finalized,
        target: null,
        revision: 0,
        state: "active",
      };
      bindings.add(binding);
      changeRuntimeResource("boxPresenceBindings", 1);

      return {
        presence,
        attach(target) {
          if (binding.state !== "active") {
            throw new Error("Box-presence binding is disposed");
          }
          if (binding.target !== target) {
            binding.target = target;
            binding.revision++;
            requestCommit();
          }
          const attachedRevision = binding.revision;
          let attached = true;
          return () => {
            if (!attached) return;
            attached = false;
            if (
              binding.state !== "active" ||
              binding.target !== target ||
              binding.revision !== attachedRevision
            ) {
              return;
            }
            binding.target = null;
            binding.revision++;
            requestCommit();
          };
        },
        dispose() {
          if (binding.state !== "active") return;
          binding.state = "retiring";
          binding.target = null;
          binding.revision++;

          // A false binding has no accepted fact to preserve and can retire
          // immediately. A true binding survives until a complete candidate is
          // accepted, so removing a Vue scope cannot publish an unaccepted false.
          if (!presence.value) {
            finalize(binding);
            return;
          }
          requestCommit();
        },
      };
    },
    beginFrame() {
      if (disposed) throw new Error("Box-presence service is disposed");
      const generation = currentGeneration + 1;
      const snapshots = new Map<
        MutableBoxPresenceBinding,
        { readonly revision: number; readonly present: boolean }
      >();
      for (const binding of bindings) {
        snapshots.set(binding, {
          revision: binding.revision,
          present:
            binding.state === "active" && binding.target !== null
              ? isPresent(root, binding.target)
              : false,
        });
      }

      let settled = false;
      return {
        generation,
        commit() {
          if (settled) throw new Error("Box-presence frame is already settled");
          settled = true;
          if (disposed) return;

          const previous = acceptedFrame.value.values;
          const values = new WeakMap<MutableBoxPresenceBinding, boolean>();
          const retired: MutableBoxPresenceBinding[] = [];
          for (const binding of bindings) {
            const snapshot = snapshots.get(binding);
            const snapshotIsCurrent = snapshot?.revision === binding.revision;
            const present = snapshotIsCurrent ? snapshot.present : (previous.get(binding) ?? false);
            if (present) values.set(binding, true);
            if (snapshotIsCurrent && binding.state === "retiring") retired.push(binding);
          }

          currentGeneration = generation;
          // Every returned computed ref reads this one map identity. A sync
          // observer of one binding therefore sees the same accepted generation
          // when it reads any sibling binding.
          acceptedFrame.value = Object.freeze({ generation, values });
          for (const binding of retired) finalize(binding);
        },
        discard() {
          if (settled) return;
          settled = true;
        },
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      currentGeneration++;
      acceptedFrame.value = Object.freeze({ generation: currentGeneration, values: new WeakMap() });
      for (const binding of Array.from(bindings)) finalize(binding);
    },
  };

  return service;
}
