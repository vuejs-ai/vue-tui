import { toRaw } from "vue";
import type { TuiNode } from "../host/nodes.ts";
import type { MouseTarget, MouseTargetRect } from "./events.ts";

const ZERO_RECT: MouseTargetRect = { x: 0, y: 0, width: 0, height: 0 };
const nodeToTarget = new WeakMap<TuiNode, InternalMouseTarget>();
const nodeRects = new WeakMap<TuiNode, MouseTargetRect>();
const internalTargetNodes = new WeakMap<InternalMouseTarget, TuiNode>();

class InternalMouseTarget implements MouseTarget {
  constructor(node: TuiNode) {
    internalTargetNodes.set(this, node);
  }

  get rect(): MouseTargetRect {
    const node = internalTargetNodes.get(toRaw(this));
    return node ? (nodeRects.get(node) ?? ZERO_RECT) : ZERO_RECT;
  }
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

export function forgetMouseTarget(node: TuiNode): void {
  const target = nodeToTarget.get(node);
  if (target) internalTargetNodes.delete(target);
  nodeRects.delete(node);
  nodeToTarget.delete(node);
}
