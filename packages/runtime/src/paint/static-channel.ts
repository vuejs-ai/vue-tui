import Yoga from "yoga-layout";
import type { TuiNode, TuiStatic } from "../host/nodes.ts";
import { paintIsolated } from "./paint.ts";
import { renderScreenReaderOutput } from "./screen-reader.ts";

/**
 * Read a static node's resolved flexDirection as the string form
 * screen-reader.ts compares against ("row" | "row-reverse" | "column" |
 * "column-reverse"). node-ops applies flexDirection to yoga but does NOT mirror
 * it into `props` (it's not in STYLE_PROPS), so we read it back from the yoga
 * node — which holds the resolved direction including the <Static> default of
 * column. This keeps separator/order derivation identical to how
 * screen-reader.ts (screen-reader.ts:73-82) would linearize a container.
 */
function resolvedFlexDirection(stat: TuiStatic): string {
  switch (stat.yoga.getFlexDirection()) {
    case Yoga.FLEX_DIRECTION_ROW:
      return "row";
    case Yoga.FLEX_DIRECTION_ROW_REVERSE:
      return "row-reverse";
    case Yoga.FLEX_DIRECTION_COLUMN_REVERSE:
      return "column-reverse";
    default:
      return "column";
  }
}

export function findStatics(root: TuiNode, out: TuiStatic[] = []): TuiStatic[] {
  if (root.type === "tui-static") out.push(root);
  if (root.type !== "text-leaf" && root.type !== "comment") {
    const containerChildren = (root as { children: TuiNode[] }).children;
    for (const child of containerChildren) findStatics(child, out);
  }
  return out;
}

function isInertStaticAnchor(child: TuiNode): boolean {
  return child.type === "comment" || (child.type === "text-leaf" && child.value === "");
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
export function paintStaticNode(
  stat: TuiStatic,
  columns: number,
  isScreenReaderEnabled = false,
): string {
  const fresh = stat.children.filter((child) => !stat.writtenNodes.has(child));
  const paintableFresh = fresh.filter((child) => !isInertStaticAnchor(child));
  // Paint (and record as written) only when there is something fresh — but the
  // prune and onWritten steps below run on EVERY commit, including the empty
  // commit that follows a cursor advance (children sliced to []). That empty
  // commit is exactly when we must (a) prune stale unmounted nodes and (b)
  // re-sync the cursor to items.length: on a shrink ([A,B]→[A]), nothing fresh
  // paints, yet Ink's `useLayoutEffect(setIndex(items.length))` still fires and
  // lowers the cursor so subsequent grows ([A,C]) render and write the new item.
  let frame = "";
  if (paintableFresh.length > 0) {
    if (isScreenReaderEnabled) {
      // SR mode: linearize the fresh static children to flat plain text instead
      // of the 2D grid painter — otherwise bordered static items would emit box
      // glyphs in screen-reader output. Ink does the same: its renderer
      // linearizes node.staticNode via renderNodeToScreenReaderOutput
      // ({ skipStaticElements:false }) (renderer.ts:24).
      //
      // We can't simply pass the whole static node to renderScreenReaderOutput:
      // its children include already-written items, but the write-once model
      // requires painting ONLY the fresh (un-written) children. So we replicate
      // exactly how screen-reader.ts linearizes a box/root container of these
      // children (screen-reader.ts:73-82): the separator and child order derive
      // from the container's resolved flexDirection (defaulting to the
      // <Static> "column" default set in static.vue's `merged` computed).
      const flexDirection = resolvedFlexDirection(stat);
      // Match screen-reader.ts:76 exactly — row/row-reverse use a space, all
      // other directions (incl. the column default) use a newline.
      const separator = flexDirection === "row" || flexDirection === "row-reverse" ? " " : "\n";
      // Match screen-reader.ts:79-82 — *-reverse directions reverse child order.
      const ordered =
        flexDirection === "row-reverse" || flexDirection === "column-reverse"
          ? [...paintableFresh].reverse()
          : paintableFresh;
      frame = ordered
        .map((child) => renderScreenReaderOutput(child, { skipStaticElements: false }))
        .filter(Boolean)
        .join(separator);
    } else {
      frame = paintIsolated(paintableFresh, columns, stat);
    }
    for (const child of paintableFresh) stat.writtenNodes.add(child);
  }
  // Empty text leaves and comments can be framework anchors around a template
  // v-for. They render no content, but still need write-once bookkeeping so
  // the cursor/prune path behaves like a normal painted batch.
  for (const child of fresh) {
    if (isInertStaticAnchor(child)) stat.writtenNodes.add(child);
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
