import type { Node as YogaNode } from "yoga-layout";
import { nodeFromMouseTarget } from "../mouse/target.ts";
import type { MouseTarget } from "../mouse/events.ts";
import type { TuiNode, TuiRoot } from "./nodes.ts";

function hasYoga(value: unknown): value is { yoga: YogaNode } {
  return Boolean(value && typeof value === "object" && "yoga" in value);
}

function hostElFromSubTree(instance: unknown): Record<string, unknown> | null {
  const subTree = (instance as { subTree?: unknown })?.subTree;
  return findHostEl(subTree);
}

function findHostEl(vnode: unknown): Record<string, unknown> | null {
  if (!vnode || typeof vnode !== "object") return null;
  const vn = vnode as { el?: unknown; component?: { subTree?: unknown }; children?: unknown };
  const el = vn.el as Record<string, unknown> | undefined;
  if (el && typeof el.type === "string" && el.type !== "comment") {
    if (!(el.type === "text-leaf" && el.value === "")) return el;
  }
  if (vn.component?.subTree) {
    const nested = findHostEl(vn.component.subTree);
    if (nested) return nested;
  }
  if (Array.isArray(vn.children)) {
    for (const child of vn.children) {
      const found = findHostEl(child);
      if (found) return found;
    }
  }
  return null;
}

export function resolveTuiNode(value: unknown): TuiNode | null {
  const mouseTargetNode = nodeFromMouseTarget(value as MouseTarget | null | undefined);
  if (mouseTargetNode) return mouseTargetNode;
  if (!value) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.type === "string") return obj as unknown as TuiNode;
  const el = obj.$el as Record<string, unknown> | undefined;
  if (el && typeof el.type === "string" && !(el.type === "text-leaf" && el.value === "")) {
    return el as unknown as TuiNode;
  }
  const host = hostElFromSubTree(obj.$);
  if (host && typeof host.type === "string") return host as unknown as TuiNode;
  return null;
}

export function resolveYogaNode(value: unknown): { yoga: YogaNode } | null {
  if (hasYoga(value)) return value;
  const el = (value as { $el?: unknown } | null | undefined)?.$el;
  if (hasYoga(el)) return el;
  const tuiNode = resolveTuiNode(value);
  if (tuiNode && "yoga" in tuiNode) return tuiNode as { yoga: YogaNode };
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
