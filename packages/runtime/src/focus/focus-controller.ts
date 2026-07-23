import { readonly, shallowRef, type Ref, type ShallowRef } from "vue";
import Yoga from "yoga-layout";
import { findRootNode } from "../host/resolve-node.ts";
import type { TuiNode, TuiRoot } from "../host/nodes.ts";
import type { RenderedTargetTransactionHost } from "../rendered-target.ts";
import { changeRuntimeResource } from "../resource-tracker.ts";

export interface InternalFocusTargetHandle {
  readonly isFocused: Readonly<Ref<boolean>>;
  focus(): void;
  blur(): void;
}

export interface InternalFocusTargetDependent {
  hostChanged(host: TuiNode | null): void;
  disposed(): void;
}

export interface InternalFocusTargetOptions {
  readonly requiresRenderedTarget?: boolean;
}

export interface InternalFocusController extends RenderedTargetTransactionHost {
  /**
   * The selected identity used by private Runtime-owned capabilities such as
   * caret placement. Targetless focus may appear here with no attached host.
   */
  readonly effectiveTarget: Readonly<ShallowRef<InternalFocusTargetHandle | null>>;
  createTarget(options?: InternalFocusTargetOptions): InternalFocusTargetHandle;
  removeTarget(target: InternalFocusTargetHandle): void;
  attachTarget(target: InternalFocusTargetHandle, host: TuiNode): () => void;
  registerTargetDependent(
    target: InternalFocusTargetHandle,
    dependent: InternalFocusTargetDependent,
  ): () => void;
  dispose(): void;
}

interface TargetDependentRegistration {
  readonly dependent: InternalFocusTargetDependent;
  active: boolean;
}

interface TargetRecord {
  readonly handle: InternalFocusTargetHandle;
  readonly isFocusedRef: ShallowRef<boolean>;
  readonly requiresRenderedTarget: boolean;
  readonly dependents: Set<TargetDependentRegistration>;
  observedHost: TuiNode | null;
  observedToken: symbol | null;
  acceptedHost: TuiNode | null;
  disposed: boolean;
}

interface CreateInternalFocusControllerOptions {
  readonly root: TuiRoot;
  readonly inert?: boolean;
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

export function createInternalFocusController(
  options: CreateInternalFocusControllerOptions,
): InternalFocusController {
  const { root, inert = false } = options;
  const records = new Set<TargetRecord>();
  const recordsByHandle = new WeakMap<InternalFocusTargetHandle, TargetRecord>();
  const owner = shallowRef<TargetRecord | null>(null);
  const effectiveTarget = shallowRef<InternalFocusTargetHandle | null>(null);

  let disposed = false;
  let transactionDepth = 0;

  const stateForTarget = (handle: InternalFocusTargetHandle): TargetRecord => {
    const record = recordsByHandle.get(handle);
    if (!record || record.disposed) {
      throw new Error("Focus target belongs to another application or has been disposed");
    }
    return record;
  };

  const publishOwner = (record: TargetRecord | null): void => {
    const nextOwner = inert ? null : record;
    const previousOwner = owner.value;
    if (previousOwner !== nextOwner) {
      if (previousOwner) previousOwner.isFocusedRef.value = false;
      owner.value = nextOwner;
      if (nextOwner) nextOwner.isFocusedRef.value = true;
    }
    effectiveTarget.value = nextOwner?.handle ?? null;
  };

  const hostIsAvailable = (host: TuiNode | null): host is TuiNode => {
    if (!host || findRootNode(host) !== root) return false;
    for (let current: TuiNode | null = host; current; current = current.parent) {
      if (isDisplayNone(current)) return false;
    }
    return true;
  };

  const notifyAcceptedHost = (record: TargetRecord, host: TuiNode | null): void => {
    for (const registration of Array.from(record.dependents)) {
      if (registration.active) registration.dependent.hostChanged(host);
    }
  };

  const reconcileRenderedFacts = (): void => {
    const hostChanges: Array<readonly [TargetRecord, TuiNode | null]> = [];
    for (const record of records) {
      if (record.disposed || !record.requiresRenderedTarget) continue;
      const nextHost = hostIsAvailable(record.observedHost) ? record.observedHost : null;
      if (record.acceptedHost === nextHost) continue;
      record.acceptedHost = nextHost;
      hostChanges.push([record, nextHost]);
    }

    const selected = owner.value;
    if (
      selected?.disposed ||
      (selected?.requiresRenderedTarget && selected.acceptedHost === null)
    ) {
      publishOwner(null);
    } else {
      publishOwner(selected);
    }

    for (const [record, host] of hostChanges) notifyAcceptedHost(record, host);
  };

  const failClosed = (): void => {
    publishOwner(null);
    for (const record of records) record.acceptedHost = null;
  };

  const runTransaction = (kind: "reconcile" | "cleanup", change: () => void): void => {
    if (disposed) {
      change();
      return;
    }
    if (transactionDepth > 0) {
      change();
      return;
    }

    transactionDepth++;
    try {
      change();
      if (kind === "reconcile") reconcileRenderedFacts();
    } catch (error) {
      // A renderer transaction that failed cannot restore a removed Vue or
      // host lifetime. Keep the latest private observation so reconciliation
      // can converge later, but clear accepted ownership without restoration.
      failClosed();
      throw error;
    } finally {
      transactionDepth--;
    }
  };

  const mutateRenderedTarget = (change: () => void): void => {
    if (transactionDepth > 0) {
      change();
      return;
    }
    runTransaction("reconcile", change);
  };

  const focusRecord = (record: TargetRecord): void => {
    if (
      disposed ||
      inert ||
      record.disposed ||
      (record.requiresRenderedTarget && record.acceptedHost === null)
    ) {
      return;
    }
    publishOwner(record);
  };

  const blurRecord = (record: TargetRecord): void => {
    if (disposed || inert || record.disposed || owner.value !== record) return;
    publishOwner(null);
  };

  const disposeDependents = (record: TargetRecord): void => {
    const registrations = [...record.dependents];
    record.dependents.clear();
    for (const registration of registrations) registration.active = false;
    for (const registration of registrations) registration.dependent.disposed();
  };

  const api: InternalFocusController = {
    effectiveTarget,
    createTarget(targetOptions = {}) {
      if (disposed) throw new Error("Focus controller is disposed");
      // Publish ownership directly instead of deriving it with a setup-scoped
      // computed. Vue 3.4 stops that computed before component disposal and a
      // retained handle can otherwise keep its final cached `true`.
      let record!: TargetRecord;
      const isFocusedRef = shallowRef(false);
      const handle: InternalFocusTargetHandle = Object.freeze({
        isFocused: readonly(isFocusedRef),
        focus: () => focusRecord(record),
        blur: () => blurRecord(record),
      });
      record = {
        handle,
        isFocusedRef,
        requiresRenderedTarget: targetOptions.requiresRenderedTarget ?? false,
        dependents: new Set(),
        observedHost: null,
        observedToken: null,
        acceptedHost: null,
        disposed: false,
      };
      records.add(record);
      recordsByHandle.set(handle, record);
      changeRuntimeResource("focusTargets", 1);
      return handle;
    },
    removeTarget(handle) {
      const record = recordsByHandle.get(handle);
      if (!record || record.disposed) return;
      record.disposed = true;
      record.observedHost = null;
      record.observedToken = null;
      record.acceptedHost = null;
      records.delete(record);
      if (owner.value === record) publishOwner(null);
      changeRuntimeResource("focusTargets", -1);
      disposeDependents(record);
    },
    attachTarget(handle, host) {
      const record = stateForTarget(handle);
      if (inert) return () => {};
      const attachment = Symbol("focus-target-attachment");
      mutateRenderedTarget(() => {
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
        mutateRenderedTarget(() => {
          record.observedHost = null;
          record.observedToken = null;
        });
      };
    },
    registerTargetDependent(handle, dependent) {
      const record = stateForTarget(handle);
      const registration: TargetDependentRegistration = { dependent, active: true };
      record.dependents.add(registration);
      try {
        dependent.hostChanged(record.acceptedHost);
      } catch (error) {
        registration.active = false;
        record.dependents.delete(registration);
        throw error;
      }
      return () => {
        if (!registration.active) return;
        registration.active = false;
        record.dependents.delete(registration);
      };
    },
    transaction(kind, change) {
      runTransaction(kind, change);
    },
    beforeInvalidateSubtree(subtree) {
      const selected = owner.value;
      if (
        selected?.requiresRenderedTarget &&
        ((selected.observedHost && isInSubtree(selected.observedHost, subtree)) ||
          (selected.acceptedHost && isInSubtree(selected.acceptedHost, subtree)))
      ) {
        // A renderer removal can be followed by a valid replacement in the same
        // accepted Vue render. Hide private host-bound effects immediately, but
        // leave the public identity selected until the complete reconciliation
        // can either preserve it or clear it without restoration.
        effectiveTarget.value = null;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      publishOwner(null);
      for (const record of records) {
        record.disposed = true;
        disposeDependents(record);
      }
      changeRuntimeResource("focusTargets", -records.size);
      records.clear();
    },
  };

  return api;
}
