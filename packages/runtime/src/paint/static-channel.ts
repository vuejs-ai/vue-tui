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

/**
 * Paint the not-yet-written children of a single <Static> node and record them
 * as written. Returns the painted frame (without trailing "\n"), or "" when
 * there is nothing fresh to write.
 *
 * Static items are write-once. `stat.children` only ever holds the currently-
 * mounted (un-written) items because the <Static> component slices written ones
 * out — but between a write and the component's cursor advance, the just-written
 * children are still mounted, so we must skip any child already in `writtenNodes`
 * (identity-tracked, since one item = several host nodes incl. fragment anchors).
 * After painting the fresh children we call `onWritten` so the component advances
 * its cursor and unmounts them (the post-commit step mirroring Ink's
 * `useLayoutEffect(setIndex)`).
 */
export function paintStaticNode(stat: TuiStatic, columns: number): string {
  const fresh = stat.children.filter((child) => !stat.writtenNodes.has(child));
  // Paint (and record as written) only when there is something fresh — but the
  // prune and onWritten steps below run on EVERY commit, including the empty
  // commit that follows a cursor advance (children sliced to []). That empty
  // commit is exactly when we must (a) prune stale unmounted nodes and (b)
  // re-sync the cursor to items.length: on a shrink ([A,B]→[A]), nothing fresh
  // paints, yet Ink's `useLayoutEffect(setIndex(items.length))` still fires and
  // lowers the cursor so subsequent grows ([A,C]) render and write the new item.
  let frame = "";
  if (fresh.length > 0) {
    frame = paintIsolated(fresh, columns, stat);
    for (const child of fresh) stat.writtenNodes.add(child);
  }
  // Prune entries that are no longer mounted so the set can't grow unbounded
  // over a long-running app (written children get unmounted on the next render).
  if (stat.writtenNodes.size > stat.children.length) {
    const live = new Set(stat.children);
    for (const node of stat.writtenNodes) {
      if (!live.has(node)) stat.writtenNodes.delete(node);
    }
  }
  // Defer the cursor sync to AFTER this commit so the just-painted items are
  // still mounted while they are written; the callback re-renders and drops
  // them. Always called (even on empty commits) so the cursor tracks
  // items.length every commit — mirroring Ink's effect on [items.length].
  // Setting the cursor to an unchanged value is a reactivity no-op, so this
  // cannot loop.
  stat.onWritten?.();
  return frame;
}

export function flushStatic(root: TuiNode, stream: NodeJS.WriteStream): void {
  for (const stat of findStatics(root)) {
    const frame = paintStaticNode(stat, stream.columns ?? 80);
    if (frame.length > 0) stream.write(frame + "\n");
  }
}
