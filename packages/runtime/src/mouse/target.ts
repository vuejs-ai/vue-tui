import { toRaw } from "vue";
import type { TuiNode } from "../host/nodes.ts";
import type { MouseTarget, MouseTargetRect } from "./events.ts";

const ZERO_RECT: MouseTargetRect = { x: 0, y: 0, width: 0, height: 0 };
const MOUSE_TARGET_NODE = Symbol("vue-tui.mouseTargetNode");
const nodeToTarget = new WeakMap<TuiNode, InternalMouseTarget>();
const targetToNode = new WeakMap<MouseTarget, TuiNode>();
const nodeRects = new WeakMap<TuiNode, MouseTargetRect>();
const internalTargetNodes = new WeakMap<InternalMouseTarget, TuiNode>();

type MouseTargetWithNodeAccessor = MouseTarget & {
  readonly [MOUSE_TARGET_NODE]?: () => TuiNode | undefined;
};

class InternalMouseTarget implements MouseTarget {
  readonly [MOUSE_TARGET_NODE] = () => internalTargetNodes.get(toRaw(this));

  constructor(node?: TuiNode) {
    if (node) this.bind(node);
  }

  get rect(): MouseTargetRect {
    const node = internalTargetNodes.get(toRaw(this));
    return node ? (nodeRects.get(node) ?? ZERO_RECT) : ZERO_RECT;
  }

  bind(node: TuiNode): void {
    internalTargetNodes.set(toRaw(this), node);
    targetToNode.set(this, node);
  }
}

export function createDetachedMouseTarget(): MouseTarget {
  return new InternalMouseTarget();
}

export function bindMouseTarget(target: MouseTarget, node: TuiNode): void {
  const existing = nodeToTarget.get(node);
  if (!existing && target instanceof InternalMouseTarget) {
    target.bind(node);
    nodeToTarget.set(node, target);
    return;
  }
  targetToNode.set(target, node);
}

export function getMouseTarget(node: TuiNode): MouseTarget {
  let target = nodeToTarget.get(node);
  if (!target) {
    target = new InternalMouseTarget(node);
    nodeToTarget.set(node, target);
  }
  return target;
}

export function setMouseTargetRect(node: TuiNode, rect: MouseTargetRect): void {
  nodeRects.set(node, rect);
}

export function clearMouseTargetRect(node: TuiNode): void {
  nodeRects.delete(node);
}

export function nodeFromMouseTarget(target: MouseTarget | null | undefined): TuiNode | null {
  if (!target) return null;
  const raw = toRaw(target);
  const exposedNode =
    (target as MouseTargetWithNodeAccessor)[MOUSE_TARGET_NODE]?.() ??
    (raw as MouseTargetWithNodeAccessor)[MOUSE_TARGET_NODE]?.();
  return exposedNode ?? targetToNode.get(target) ?? targetToNode.get(raw) ?? null;
}

export function forgetMouseTarget(node: TuiNode): void {
  nodeRects.delete(node);
  const target = nodeToTarget.get(node);
  if (target) {
    targetToNode.delete(target);
    nodeToTarget.delete(node);
  }
}
