import {
  inject,
  onScopeDispose,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type ShallowRef,
} from "vue";
import { InternalCaretControllerKey } from "../caret/caret-context.ts";
import { useInternalElementGeometry } from "../geometry/internal-use-element-geometry.ts";
import type { CellPoint, ElementTarget } from "../element-target.ts";
import type { UseFocusReturn } from "./useFocus.ts";

export type CaretHiddenReason =
  | "unavailable"
  | "detached"
  | "pending"
  | "hidden"
  | "clipped"
  | "outside"
  | "invalid-position"
  | "unrelated";

export type CaretState =
  | { readonly status: "unavailable" }
  | { readonly status: "inactive" }
  | { readonly status: "hidden"; readonly reason: CaretHiddenReason }
  | { readonly status: "visible"; readonly surface: CellPoint };

export interface UseCaretOptions {
  /** This request is eligible only while this exact logical focus target is effective. */
  readonly focus: UseFocusReturn;
  /** Zero-based rendered cell local to target; null or undefined makes the request inactive. */
  readonly position: MaybeRefOrGetter<CellPoint | null | undefined>;
}

export interface UseCaretReturn {
  /** Latest complete state accepted by the per-application caret arbiter. */
  readonly state: Readonly<ShallowRef<CaretState>>;
}

function readPosition(source: UseCaretOptions["position"]): unknown {
  const value = toValue(source);
  if (typeof value !== "object" || value === null) return value;
  // Read both fields so a reactive object mutated in place remains observable,
  // then snapshot it so validation and registration see one atomic candidate.
  const point = value as { x?: unknown; y?: unknown };
  return { x: point.x, y: point.y };
}

/** Declare one focus-bound caret at a rendered element-local cell. */
export function useCaret(target: ElementTarget, options: UseCaretOptions): UseCaretReturn {
  const controller = inject(InternalCaretControllerKey, null);
  if (!controller) throw new Error("useCaret() must be called inside a vue-tui render tree");
  if (typeof options !== "object" || options === null) {
    throw new TypeError("useCaret() options must be an object");
  }

  const registration = controller.register(options.focus, readPosition(options.position));
  let stopPosition: (() => void) | undefined;
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    stopPosition?.();
    registration.dispose();
  };

  try {
    useInternalElementGeometry(target, (geometry, resolvedTarget) => {
      registration.updateGeometry(geometry, resolvedTarget);
    });
    stopPosition = watch(
      () => readPosition(options.position),
      (position) => registration.updatePosition(position),
      { flush: "sync" },
    );
  } catch (error) {
    dispose();
    throw error;
  }

  onScopeDispose(dispose);
  return Object.freeze({ state: registration.state });
}
