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

interface PreparedStaticBatch {
  readonly stat: TuiStatic;
  readonly fresh: readonly TuiNode[];
  readonly frame: string;
  readonly renderedThrough: number;
}

/**
 * One candidate Static output transaction. Preparation is side-effect free with
 * respect to write-once bookkeeping. `accept()` settles every prepared node and
 * advances each component only after the corresponding output write returns
 * normally. `abandon()` settles the nodes without advancing the components when
 * a write throws: the stream may already have handed off some bytes, so retrying
 * automatically could duplicate history.
 */
export interface PreparedStaticOutput {
  /** Combined fresh Static bytes, including each non-empty frame's trailing newline. */
  readonly output: string;
  /** Confirm a normally returned output write, or a successful output-free commit. */
  accept(): void;
  /** Prevent retry after an indeterminate throwing output write. */
  abandon(): void;
}

/**
 * Paint the not-yet-settled children of one <Static> node without changing its
 * write-once state. The returned frame excludes the terminal-channel newline.
 *
 * Static items are write-once. `stat.children` normally holds the currently
 * uncommitted items because the component slices accepted ones out. Between a
 * successful write and the component's cursor update, accepted children remain
 * mounted briefly, so preparation skips identities already in `writtenNodes`.
 */
function prepareStaticNode(
  stat: TuiStatic,
  columns: number,
  isScreenReaderEnabled = false,
): PreparedStaticBatch {
  const fresh = stat.children.filter((child) => !stat.writtenNodes.has(child));
  const paintableFresh = fresh.filter((child) => !isInertStaticAnchor(child));
  // Paint only when there is something fresh. A genuinely fresh item that
  // renders no bytes (for example a template anchor or empty Text) is still
  // settled and notified after a successful output-free commit.
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
  }
  return { stat, fresh, frame, renderedThrough: stat.renderedThrough };
}

/** Prepare every Static region as one ordered output transaction. */
export function prepareStaticOutput(
  root: TuiNode,
  columns: number,
  isScreenReaderEnabled = false,
): PreparedStaticOutput {
  const batches = findStatics(root).map((stat) =>
    prepareStaticNode(stat, columns, isScreenReaderEnabled),
  );
  const output = batches.map(({ frame }) => (frame.length > 0 ? frame + "\n" : "")).join("");
  let state: "pending" | "accepted" | "abandoned" = "pending";

  const settle = (next: "accepted" | "abandoned"): boolean => {
    if (state !== "pending") return false;
    state = next;

    // Mark every prepared identity before invoking any component callback. One
    // combined stdout write covers every batch; if a callback throws after that
    // write, no later batch may become eligible for duplicate output.
    for (const { stat, fresh } of batches) {
      for (const child of fresh) stat.writtenNodes.add(child);

      // Accepted children unmount on the next Vue update. Prune identities that
      // are already gone so a long-running application retains only live nodes.
      if (stat.writtenNodes.size > stat.children.length) {
        const live = new Set(stat.children);
        for (const node of stat.writtenNodes) {
          if (!live.has(node)) stat.writtenNodes.delete(node);
        }
      }
    }
    return true;
  };

  return {
    output,
    accept() {
      if (!settle("accepted")) return;

      // Run every notification even if one unexpectedly throws. The bytes for
      // all batches have already been accepted, so all cursors must observe the
      // same outcome before the first callback error propagates.
      const errors: unknown[] = [];
      for (const { stat, fresh, renderedThrough } of batches) {
        // A genuinely fresh empty-rendering item still has host identities and
        // must advance. A batch with no fresh identity is only a bookkeeping
        // no-op; in particular, it must not turn an earlier indeterminate write
        // abandoned into a later false acceptance during teardown.
        if (fresh.length === 0) continue;
        try {
          stat.onWritten?.(renderedThrough);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) {
        throw new AggregateError(errors, "Failed to accept Static output.");
      }
    },
    abandon() {
      settle("abandoned");
    },
  };
}

export function flushStatic(root: TuiNode, stream: NodeJS.WriteStream): void {
  const prepared = prepareStaticOutput(root, stream.columns ?? 80);
  if (prepared.output.length === 0) {
    prepared.accept();
    return;
  }
  try {
    stream.write(prepared.output);
  } catch (error) {
    prepared.abandon();
    throw error;
  }
  prepared.accept();
}
