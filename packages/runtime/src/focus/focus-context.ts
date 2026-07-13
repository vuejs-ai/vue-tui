import type { InjectionKey } from "vue";
import type { InternalFocusController, InternalFocusScopeHandle } from "./focus-controller.ts";

/** Private per-application focus owner consumed by the public F4 composables. */
export const InternalFocusControllerKey: InjectionKey<InternalFocusController> = Symbol(
  "vue-tui:focus-controller",
);

export interface InternalProvidedFocusScope {
  readonly controller: InternalFocusController;
  readonly handle: InternalFocusScopeHandle;
  readonly parent: InternalProvidedFocusScope | null;
  readonly children: Set<InternalProvidedFocusScope>;
  readonly dependents: Set<() => void>;
  disposed: boolean;
}

export const InternalFocusScopeKey: InjectionKey<InternalProvidedFocusScope> =
  Symbol("vue-tui:focus-scope");

const providedScopeByHandle = new WeakMap<InternalFocusScopeHandle, InternalProvidedFocusScope>();

export function createInternalProvidedFocusScope(
  controller: InternalFocusController,
  handle: InternalFocusScopeHandle,
  parent: InternalProvidedFocusScope | null,
): InternalProvidedFocusScope {
  const scope: InternalProvidedFocusScope = {
    controller,
    handle,
    parent,
    children: new Set(),
    dependents: new Set(),
    disposed: false,
  };
  parent?.children.add(scope);
  providedScopeByHandle.set(handle, scope);
  return scope;
}

export function getInternalProvidedFocusScope(
  handle: InternalFocusScopeHandle,
): InternalProvidedFocusScope | undefined {
  return providedScopeByHandle.get(handle);
}

export function markInternalFocusScopeDisposed(scope: InternalProvidedFocusScope): void {
  if (scope.disposed) return;
  scope.disposed = true;
  scope.parent?.children.delete(scope);
  for (const child of scope.children) markInternalFocusScopeDisposed(child);
  scope.children.clear();
  for (const dispose of scope.dependents) dispose();
  scope.dependents.clear();
}

export function registerInternalFocusScopeDependent(
  scope: InternalProvidedFocusScope,
  dispose: () => void,
): () => void {
  if (scope.disposed) {
    dispose();
    return () => {};
  }
  scope.dependents.add(dispose);
  return () => scope.dependents.delete(dispose);
}
