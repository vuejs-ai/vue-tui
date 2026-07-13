import {
  inject,
  onScopeDispose,
  toValue,
  watch,
  type ComponentPublicInstance,
  type MaybeRefOrGetter,
  type ShallowRef,
} from "vue";
import {
  InternalFocusControllerKey,
  InternalFocusScopeKey,
  getInternalProvidedFocusScope,
  registerInternalFocusScopeDependent,
  type InternalProvidedFocusScope,
} from "../focus/focus-context.ts";
import type {
  InternalFocusScopeHandle,
  InternalFocusTargetUpdate,
} from "../focus/focus-controller.ts";
import { resolveTuiNode } from "../host/resolve-node.ts";
import { useRenderedTargetRegistration } from "../rendered-target.ts";
import type { UseFocusScopeReturn } from "./useFocusScope.ts";

declare const focusHandleBrand: unique symbol;

export interface UseFocusOptions {
  readonly scope?: UseFocusScopeReturn;
  readonly disabled?: MaybeRefOrGetter<boolean>;
  readonly tabIndex?: MaybeRefOrGetter<0 | -1>;
  readonly autoFocus?: MaybeRefOrGetter<boolean>;
}

export interface UseFocusReturn {
  readonly [focusHandleBrand]: true;
  readonly isFocused: Readonly<ShallowRef<boolean>>;
  focus(): boolean;
  blur(): boolean;
}

function readBoolean(
  source: MaybeRefOrGetter<boolean> | undefined,
  fallback: boolean,
  option: string,
): boolean {
  const value = source === undefined ? fallback : toValue(source);
  if (typeof value !== "boolean") {
    throw new TypeError(`useFocus() ${option} must resolve to a boolean`);
  }
  return value;
}

function readTabIndex(source: MaybeRefOrGetter<0 | -1> | undefined): 0 | -1 {
  const value = source === undefined ? 0 : toValue(source);
  if (value !== 0 && value !== -1) {
    throw new TypeError("useFocus() tabIndex must resolve to 0 or -1");
  }
  return value;
}

export function useFocus(
  target: MaybeRefOrGetter<ComponentPublicInstance | null | undefined>,
  options: UseFocusOptions = {},
): UseFocusReturn {
  const controller = inject(InternalFocusControllerKey, null);
  if (!controller) throw new Error("useFocus() must be called inside a vue-tui render tree");

  const inheritedScope = inject(InternalFocusScopeKey, null);
  const hasExplicitScope = options.scope !== undefined;
  const scopeHandle = options.scope as InternalFocusScopeHandle | undefined;
  const scopeLifetime: InternalProvidedFocusScope | undefined = hasExplicitScope
    ? getInternalProvidedFocusScope(scopeHandle!)
    : (inheritedScope ?? undefined);
  if (hasExplicitScope && !scopeLifetime) {
    throw new Error("Focus scope belongs to another application or has been disposed");
  }
  const assignedScope = scopeLifetime?.handle;

  const readOptions = (): Required<InternalFocusTargetUpdate> => ({
    disabled: readBoolean(options.disabled, false, "disabled"),
    tabIndex: readTabIndex(options.tabIndex),
    autoFocus: readBoolean(options.autoFocus, false, "autoFocus"),
  });

  const initial = readOptions();
  const handle = controller.createTarget({ scope: assignedScope, ...initial });
  let stopOptions: (() => void) | undefined;
  let disposeRenderedTarget: (() => void) | undefined;
  let unregisterScopeDependent: (() => void) | undefined;
  let disposed = false;
  const dispose = (removeTarget: boolean): void => {
    if (disposed) return;
    disposed = true;
    stopOptions?.();
    unregisterScopeDependent?.();
    disposeRenderedTarget?.();
    if (removeTarget) controller.removeTarget(handle);
  };
  try {
    stopOptions = watch(
      readOptions,
      (update) => {
        // Vue may still invoke a watch callback with `undefined` after the
        // source getter rejects an invalid reactive option. The validation
        // error is the public failure; keep the last accepted controller
        // state and wait for the next valid value.
        if (!update) return;
        controller.updateTarget(handle, update);
      },
      { flush: "sync" },
    );
    disposeRenderedTarget = useRenderedTargetRegistration(
      () => resolveTuiNode(toValue(target)),
      (host) => controller.attachTarget(handle, host),
    );
    if (scopeLifetime) {
      unregisterScopeDependent = registerInternalFocusScopeDependent(scopeLifetime, () =>
        dispose(false),
      );
    }
  } catch (error) {
    dispose(true);
    throw error;
  }

  onScopeDispose(() => dispose(true));

  return handle as UseFocusReturn;
}
