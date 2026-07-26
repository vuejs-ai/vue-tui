import {
  inject,
  isRef,
  onMounted,
  onScopeDispose,
  watch,
  type ComponentPublicInstance,
  type Ref,
} from "vue";
import { AppContextKey } from "../context.ts";
import {
  resolveFocusComponentBoundary,
  validateFocusComponentTarget,
} from "../focus/component-target.ts";
import { InternalFocusControllerKey } from "../focus/focus-context.ts";
import {
  useRenderedTargetRegistrationControl,
  type RenderedTargetRegistrationControl,
} from "../rendered-target.ts";

/**
 * A Vue ref whose component boundary controls this focus handle's rendered
 * availability.
 *
 * The target is not the focus identity and does not define input routing or
 * navigation. If the boundary becomes unavailable or its rendered ancestry is
 * hidden or detached, this handle loses focus. Later availability does not
 * restore focus.
 */
export type FocusTarget = Readonly<Ref<ComponentPublicInstance | null | undefined>>;

export interface UseFocusReturn {
  readonly isFocused: Readonly<Ref<boolean>>;
  focus(): void;
  blur(): void;
}

/**
 * Create one explicit focus identity for this component.
 *
 * - Each call is a distinct identity; `focus()` replaces the current owner
 *   synchronously. One owner per app.
 * - `isFocused` composes directly with
 *   `useInput(handler, { isActive: focus.isFocused })`.
 * - No target ties validity to the Vue scope; a component ref also clears focus
 *   on removal or hidden ancestry.
 * - Operations on a disposed handle are inert. There is no focus manager, Tab
 *   handling, or restoration.
 *
 * @example Focus-gated input
 * ```tsx
 * const focus = useFocus();
 * useInput((event) => handle(event), { isActive: focus.isFocused });
 * ```
 *
 * @example Bind the identity to a rendered Box
 * ```tsx
 * const panel = shallowRef<InstanceType<typeof Box> | null>(null);
 * const focus = useFocus(panel); // focus clears if the Box unmounts
 * ```
 */
export function useFocus(): UseFocusReturn;
export function useFocus(target: FocusTarget): UseFocusReturn;
export function useFocus(target?: FocusTarget): UseFocusReturn {
  const hasTarget = arguments.length > 0;
  const controller = inject(InternalFocusControllerKey, null);
  const app = inject(AppContextKey, null);
  if (!controller || !app) {
    throw new Error("useFocus() must be called inside a vue-tui render tree");
  }
  if (hasTarget && !isRef(target)) {
    throw new TypeError("useFocus() target must be a Vue ref to a component instance");
  }

  const internal = controller.createTarget({
    requiresRenderedTarget: hasTarget,
  });
  let targetRegistration: RenderedTargetRegistrationControl | undefined;
  let stopValidation: (() => void) | undefined;
  let disposed = false;

  const validateCurrentTarget = (): void => {
    if (hasTarget) validateFocusComponentTarget(target!.value, app);
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    stopValidation?.();
    targetRegistration?.dispose();
    controller.removeTarget(internal);
  };

  try {
    if (hasTarget) {
      validateCurrentTarget();
      stopValidation = watch(target!, validateCurrentTarget, { flush: "post" });
      onMounted(validateCurrentTarget);
      targetRegistration = useRenderedTargetRegistrationControl(
        () => {
          try {
            validateFocusComponentTarget(target!.value, app);
            return resolveFocusComponentBoundary(target!.value);
          } catch {
            // The validation watcher or an explicit operation reports the
            // public TypeError. Renderer reconciliation treats the invalid
            // value only as an unavailable boundary in the meantime.
            return null;
          }
        },
        (host) => controller.attachTarget(internal, host),
      );
    }
  } catch (error) {
    dispose();
    throw error;
  }

  onScopeDispose(dispose);

  return Object.freeze({
    isFocused: internal.isFocused,
    focus() {
      if (disposed) return;
      if (hasTarget) {
        validateCurrentTarget();
        // Vue assigns template refs before mounted hooks. Reconcile explicitly
        // so onMounted(() => focus.focus()) observes that already-attached
        // boundary without turning an earlier unavailable request into a queue.
        targetRegistration?.reconcile();
      }
      internal.focus();
    },
    blur() {
      if (disposed) return;
      internal.blur();
    },
  });
}
