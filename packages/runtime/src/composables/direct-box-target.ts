import { inject, isRef, onMounted, watch, type Ref } from "vue";
import { isPublicBoxInstance, type PublicBoxInstance } from "../components/public-box.ts";
import { AppContextKey, type AppContext } from "../context.ts";
import { resolveTuiNode } from "../host/resolve-node.ts";
import type { TuiBox } from "../host/nodes.ts";
import { useInternalRenderSession } from "../render-session.ts";

export interface DirectBoxTarget {
  readonly app: AppContext;
  /** Renderer-owned resolvers must turn public misuse into a detached target. */
  readonly resolve: () => TuiBox | null;
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

/** Shared author-ref validation for public composables that target one direct Box. */
export function useDirectBoxTarget<T extends PublicBoxInstance>(
  apiName: string,
  target: Readonly<Ref<T | null | undefined>>,
): DirectBoxTarget {
  // Give every misuse the same clear tree-boundary failure, including string
  // rendering (which supplies a real session but intentionally no live service).
  useInternalRenderSession();
  const app = inject(AppContextKey);
  if (!app) throw new Error("render session is unavailable outside a vue-tui render tree");

  const directBoxMessage = `${apiName}() target must be a ref bound directly to <Box>`;
  if (!isRef(target)) throw new TypeError(directBoxMessage);

  const validatePublicBox = (value: T | null | undefined): void => {
    if (value !== null && value !== undefined && !isPublicBoxInstance(value)) {
      throw new TypeError(directBoxMessage);
    }
    if (value === null || value === undefined) return;
    if (owningRuntimeApp(value) !== app) {
      throw new TypeError(`${apiName}() target belongs to a different vue-tui app`);
    }
    const node = resolveTuiNode(value);
    if (node && node.type !== "tui-box") throw new TypeError(directBoxMessage);
  };

  const validateCurrentTarget = (): void => validatePublicBox(target.value);

  // Validate an already-populated ref during setup. Later ref changes are
  // validated by Vue's error-managed watcher rather than by a renderer commit.
  validateCurrentTarget();
  watch(target, (value) => validatePublicBox(value), { flush: "post" });
  // Synchronous string rendering does not flush the post-render ref watcher
  // before its one document pass. Validate again when Vue has assigned refs.
  onMounted(validateCurrentTarget);

  return {
    app,
    resolve: (): TuiBox | null => {
      try {
        const value = target.value;
        if (!isPublicBoxInstance(value) || owningRuntimeApp(value) !== app) return null;
        const node = resolveTuiNode(value);
        return node?.type === "tui-box" ? node : null;
      } catch {
        return null;
      }
    },
  };
}
