import { Comment, Fragment, isVNode, type ComponentPublicInstance, type VNode } from "vue";
import { AppContextKey, type AppContext } from "../context.ts";
import { isTuiNode, type TuiNode } from "../host/nodes.ts";

const STATEFUL_COMPONENT = 1 << 2;
const DEV_ROOT_FRAGMENT = 1 << 11;

interface ComponentInternals {
  readonly appContext?: {
    readonly provides?: Record<PropertyKey, unknown>;
  };
  readonly subTree?: VNode;
  readonly vnode?: VNode;
}

function componentInternals(value: unknown): ComponentInternals | undefined {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return undefined;
  }
  return (value as { readonly $?: ComponentInternals }).$;
}

function filterSingleRoot(children: unknown): VNode | null {
  if (!Array.isArray(children)) return null;
  let singleRoot: VNode | undefined;
  for (const child of children) {
    if (!isVNode(child)) return null;
    if (child.type === Comment && child.children !== "v-if") continue;
    if (singleRoot) return null;
    singleRoot = child;
  }
  return singleRoot ?? null;
}

function normalizeDevelopmentRoot(vnode: VNode): VNode {
  let current = vnode;
  while (current.patchFlag > 0 && (current.patchFlag & DEV_ROOT_FRAGMENT) !== 0) {
    const childRoot = filterSingleRoot(current.children);
    if (!childRoot) break;
    current = childRoot;
  }
  return current;
}

export function validateFocusComponentTarget(
  value: unknown,
  app: AppContext,
  apiName = "useFocus",
): asserts value is ComponentPublicInstance {
  if (value === null || value === undefined) return;
  const instance = componentInternals(value);
  if (!instance || !instance.vnode || (instance.vnode.shapeFlag & STATEFUL_COMPONENT) === 0) {
    throw new TypeError(`${apiName}() target must resolve to a stateful Vue component instance`);
  }
  if (instance.appContext?.provides?.[AppContextKey] !== app) {
    throw new TypeError(`${apiName}() target belongs to a different vue-tui app`);
  }
}

/**
 * Resolve one component-root boundary without selecting or collecting rendered
 * descendants. A true Fragment stays represented by its own start anchor.
 */
export function resolveFocusComponentBoundary(value: unknown): TuiNode | null {
  const instance = componentInternals(value);
  let vnode = instance?.subTree;
  const visited = new Set<VNode>();

  while (vnode && !visited.has(vnode)) {
    visited.add(vnode);
    vnode = normalizeDevelopmentRoot(vnode);
    if (vnode.type === Comment) return null;

    if ((vnode.shapeFlag & STATEFUL_COMPONENT) !== 0) {
      const nested = vnode.component?.subTree;
      if (!nested) return null;
      vnode = nested;
      continue;
    }

    if (vnode.type === Fragment) {
      return isTuiNode(vnode.el) && vnode.el.type !== "comment" ? vnode.el : null;
    }

    return isTuiNode(vnode.el) && vnode.el.type !== "comment" ? vnode.el : null;
  }

  return null;
}
