import { inject, isRef, onMounted, readonly, shallowRef, watch, type Ref } from "vue";
import { isPublicBoxInstance, type PublicBoxInstance } from "../components/public-box.ts";
import { AppContextKey, type AppContext } from "../context.ts";
import { useInternalElementGeometry } from "../geometry/internal-use-element-geometry.ts";
import type { InternalElementGeometry } from "../geometry/geometry-service.ts";
import { resolveTuiNode } from "../host/resolve-node.ts";
import type { TuiNode } from "../host/nodes.ts";
import { useInternalRenderSession } from "../render-session.ts";

/** The full layout size of a Box in terminal cells. */
export interface BoxSize {
  readonly width: number;
  readonly height: number;
}

function owningRuntimeApp(target: PublicBoxInstance): AppContext | undefined {
  return (
    target as unknown as {
      readonly $?: {
        readonly appContext?: {
          readonly provides?: Record<PropertyKey, unknown>;
        };
      };
    }
  ).$?.appContext?.provides?.[AppContextKey] as AppContext | undefined;
}

function isResolved(
  geometry: InternalElementGeometry,
): geometry is Extract<
  InternalElementGeometry,
  { readonly status: "zero-size" | "fully-clipped" | "visible" }
> {
  return (
    geometry.status === "zero-size" ||
    geometry.status === "fully-clipped" ||
    geometry.status === "visible"
  );
}

/** Observe the last size of one directly referenced Box whose visual paint was accepted. */
export function useBoxSize<T extends PublicBoxInstance>(
  target: Readonly<Ref<T | null | undefined>>,
): Readonly<Ref<BoxSize | null>> {
  // Give every misuse the same clear tree-boundary failure, including string
  // rendering (which supplies a real session but intentionally no geometry).
  useInternalRenderSession();
  const app = inject(AppContextKey);
  if (!app) throw new Error("render session is unavailable outside a vue-tui render tree");
  if (!isRef(target)) {
    throw new TypeError("useBoxSize() target must be a ref bound directly to <Box>");
  }

  const validatePublicBox = (value: T | null | undefined): void => {
    if (value !== null && value !== undefined && !isPublicBoxInstance(value)) {
      throw new TypeError("useBoxSize() target must be a ref bound directly to <Box>");
    }
    if (value === null || value === undefined) return;
    if (owningRuntimeApp(value) !== app) {
      throw new TypeError("useBoxSize() target belongs to a different vue-tui app");
    }
    const node = resolveTuiNode(value);
    if (node && node.type !== "tui-box") {
      throw new TypeError("useBoxSize() target must resolve to <Box>");
    }
  };

  const validateCurrentTarget = (): void => validatePublicBox(target.value);

  // The renderer calls this resolver from its own commit transaction. It must
  // never throw: public programming errors are reported by the Vue-managed
  // validation paths below, while an invalid target stays detached here.
  const resolvePublicBox = (): TuiNode | null => {
    try {
      const value = target.value;
      if (!isPublicBoxInstance(value) || owningRuntimeApp(value) !== app) return null;
      const node = resolveTuiNode(value);
      return node?.type === "tui-box" ? node : null;
    } catch {
      return null;
    }
  };

  // Validate an already-populated ref during setup. Later ref changes are
  // validated by Vue's error-managed watcher rather than by the renderer's raw
  // post-flush commit callback.
  validateCurrentTarget();
  watch(target, (value) => validatePublicBox(value), { flush: "post" });
  // Synchronous string rendering does not flush the post-render ref watcher
  // before its one document pass. Validate again when Vue has assigned refs.
  onMounted(validateCurrentTarget);

  const mutableSize = shallowRef<BoxSize | null>(null);
  let currentTarget: TuiNode | null = null;
  let hasAcceptedSize = false;

  const clear = (): void => {
    hasAcceptedSize = false;
    if (mutableSize.value !== null) mutableSize.value = null;
  };

  useInternalElementGeometry(resolvePublicBox, (geometry, resolvedTarget) => {
    if (resolvedTarget !== currentTarget) {
      currentTarget = resolvedTarget;
      clear();
    }

    if (resolvedTarget === null || geometry.status === "detached") {
      clear();
      return;
    }
    if (geometry.status === "hidden") {
      clear();
      return;
    }
    if (!isResolved(geometry)) {
      // Pending paint and temporary surface unavailability do not erase the
      // last size accepted for this same Box.
      if (!hasAcceptedSize) clear();
      return;
    }

    const width = geometry.parent.width;
    const height = geometry.parent.height;
    const previous = mutableSize.value;
    hasAcceptedSize = true;
    if (previous?.width === width && previous.height === height) return;
    mutableSize.value = Object.freeze({ width, height });
  });

  return readonly(mutableSize) as Readonly<Ref<BoxSize | null>>;
}
