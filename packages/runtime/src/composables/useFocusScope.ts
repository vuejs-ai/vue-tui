import {
  inject,
  onScopeDispose,
  provide,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type ShallowRef,
} from "vue";
import {
  InternalFocusControllerKey,
  InternalFocusScopeKey,
  createInternalProvidedFocusScope,
  markInternalFocusScopeDisposed,
  registerInternalFocusScopeDependent,
} from "../focus/focus-context.ts";
import type {
  InternalFocusScopeHandle,
  InternalFocusScopeUpdate,
} from "../focus/focus-controller.ts";

declare const focusScopeHandleBrand: unique symbol;

export interface UseFocusScopeOptions {
  readonly isActive?: MaybeRefOrGetter<boolean>;
  readonly trapped?: MaybeRefOrGetter<boolean>;
}

export interface UseFocusScopeReturn {
  readonly [focusScopeHandleBrand]: true;
  readonly containsFocus: Readonly<ShallowRef<boolean>>;
}

function readBoolean(
  source: MaybeRefOrGetter<boolean> | undefined,
  fallback: boolean,
  option: string,
): boolean {
  const value = source === undefined ? fallback : toValue(source);
  if (typeof value !== "boolean") {
    throw new TypeError(`useFocusScope() ${option} must resolve to a boolean`);
  }
  return value;
}

export function useFocusScope(options: UseFocusScopeOptions = {}): UseFocusScopeReturn {
  const controller = inject(InternalFocusControllerKey, null);
  if (!controller) {
    throw new Error("useFocusScope() must be called inside a vue-tui render tree");
  }
  const parent = inject(InternalFocusScopeKey, null);
  const readOptions = (): Required<InternalFocusScopeUpdate> => ({
    active: readBoolean(options.isActive, true, "isActive"),
    trapped: readBoolean(options.trapped, false, "trapped"),
  });

  const initial = readOptions();
  const handle = controller.createScope({ parent: parent?.handle, ...initial });
  const provided = createInternalProvidedFocusScope(controller, handle, parent);
  provide(InternalFocusScopeKey, provided);

  let stopOptions: (() => void) | undefined;
  try {
    stopOptions = watch(readOptions, (update) => controller.updateScope(handle, update), {
      flush: "sync",
    });
    registerInternalFocusScopeDependent(provided, () => stopOptions?.());
  } catch (error) {
    markInternalFocusScopeDisposed(provided);
    controller.removeScope(handle);
    throw error;
  }

  onScopeDispose(() => {
    stopOptions?.();
    if (provided.disposed) return;
    markInternalFocusScopeDisposed(provided);
    controller.removeScope(handle);
  });

  return handle as InternalFocusScopeHandle as UseFocusScopeReturn;
}
