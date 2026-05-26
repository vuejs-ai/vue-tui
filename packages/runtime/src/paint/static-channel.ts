import type { TuiNode, TuiStatic } from "../host/nodes.ts";
import { paintIsolated } from "./paint.ts";

export function findStatics(root: TuiNode, out: TuiStatic[] = []): TuiStatic[] {
  if (root.type === "static") out.push(root);
  if (root.type !== "text-leaf" && root.type !== "comment") {
    const containerChildren = (root as { children: TuiNode[] }).children;
    for (const child of containerChildren) findStatics(child, out);
  }
  return out;
}

export function flushStatic(root: TuiNode, stream: NodeJS.WriteStream): void {
  for (const stat of findStatics(root)) {
    const fresh = stat.children.slice(stat.writtenCount);
    if (fresh.length === 0) continue;
    const frame = paintIsolated(fresh, stream.columns ?? 80, stat);
    if (frame.length > 0) stream.write(frame + "\n");
    stat.writtenCount = stat.children.length;
  }
}
