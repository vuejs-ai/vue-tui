import { isTuiNode, type TuiNode, type TuiRoot } from "./nodes.ts";

function isRenderedHostNode(value: unknown): value is TuiNode {
  if (!isTuiNode(value) || value.type === "comment") return false;
  const node = value as TuiNode & { value?: unknown };
  return !(node.type === "text-leaf" && node.value === "");
}

function hostElFromSubTree(instance: unknown): TuiNode | null {
  const subTree = (instance as { subTree?: unknown })?.subTree;
  return findHostEl(subTree);
}

function findHostEl(vnode: unknown): TuiNode | null {
  if (!vnode || typeof vnode !== "object") return null;
  const vn = vnode as {
    type?: unknown;
    el?: unknown;
    component?: { subTree?: unknown };
    children?: unknown;
  };
  if (vn.component?.subTree) {
    const nested = findHostEl(vn.component.subTree);
    if (nested) return nested;
  }
  const el = vn.el;
  // A string vnode type is one of this renderer's host primitives. Component
  // and Fragment vnodes may instead point `el` at a boundary text anchor, so
  // their rendered subtree must win over that anchor.
  if (typeof vn.type === "string" && isRenderedHostNode(el)) {
    return el;
  }
  if (Array.isArray(vn.children)) {
    for (const child of vn.children) {
      const found = findHostEl(child);
      if (found) return found;
    }
  }
  if (isRenderedHostNode(el)) return el;
  return null;
}

export function resolveTuiNode(value: unknown): TuiNode | null {
  if (!value) return null;
  if (isRenderedHostNode(value)) return value;
  const obj = value as Record<string, unknown>;
  const host = hostElFromSubTree(obj.$);
  if (isRenderedHostNode(host)) return host as unknown as TuiNode;
  const el = obj.$el;
  if (isRenderedHostNode(el)) return el as unknown as TuiNode;
  return null;
}

export function findRootNode(node: TuiNode | null): TuiRoot | null {
  let current: TuiNode | null = node;
  while (current) {
    if (current.type === "root") return current;
    current = current.parent;
  }
  return null;
}
