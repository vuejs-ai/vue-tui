import { NESTED_STATIC_ERROR, type TuiNode, type TuiStatic } from "../host/nodes.ts";
import { paintIsolated } from "./paint.ts";

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

function validateStaticPlacement(statics: readonly TuiStatic[]): void {
  for (const stat of statics) {
    let ancestor = stat.parent;
    while (ancestor) {
      if (ancestor.type === "tui-static") throw new Error(NESTED_STATIC_ERROR);
      ancestor = ancestor.parent;
    }
  }
}

interface PreparedStaticBatch {
  readonly stat: TuiStatic;
  readonly frame: string;
}

/**
 * One candidate Static output transaction. Preparation does not change any
 * host's write-once state. `accept()` seals every prepared host before notifying
 * components; `abandon()` seals them without notification after an indeterminate
 * throwing write.
 */
export interface PreparedStaticOutput {
  /** Combined open Static bytes, including each non-empty frame's trailing newline. */
  readonly output: string;
  /**
   * Confirm every non-empty block represented in this prepared transaction.
   * A preparation hook may return a finalizer that runs after every component
   * has received its acceptance notification, including when one throws.
   */
  accept(beforeNotify?: (accepted: readonly TuiStatic[]) => void | (() => void)): void;
  /** Prevent retry for every non-empty block in an indeterminate transaction. */
  abandon(): void;
}

/** Paint one open <Static> host without changing its write-once state. */
function prepareStaticNode(stat: TuiStatic, columns: number): PreparedStaticBatch {
  const paintableChildren = stat.children.filter((child) => !isInertStaticAnchor(child));
  let frame = "";
  if (paintableChildren.length > 0) {
    frame = paintIsolated(paintableChildren, columns, stat);
  }
  return { stat, frame };
}

/** Prepare every currently open Static region as one ordered output transaction. */
export function prepareStaticOutput(
  root: TuiNode,
  columns: number,
  statics = findStatics(root),
): PreparedStaticOutput {
  validateStaticPlacement(statics);
  const batches = statics
    .filter((stat) => stat.commitState === "open")
    .map((stat) => prepareStaticNode(stat, columns));
  // An output-free instance is still a producer: it remains open until a later
  // eligible render produces bytes, or ordinary Vue unmount removes it. Only
  // blocks represented in this transaction may be accepted or abandoned.
  const committableBatches = batches.filter(({ frame }) => frame.length > 0);
  const output = committableBatches.map(({ frame }) => frame + "\n").join("");
  let state: "pending" | "accepted" | "abandoned" = "pending";

  const settle = (next: "accepted" | "abandoned"): TuiStatic[] => {
    if (state !== "pending") return [];
    state = next;
    const transitioned: TuiStatic[] = [];
    for (const { stat } of committableBatches) {
      if (stat.commitState !== "open") continue;
      stat.commitState = next;
      transitioned.push(stat);
    }
    return transitioned;
  };

  return {
    output,
    accept(beforeNotify) {
      const accepted = settle("accepted");

      // All hosts are sealed before the first callback can re-enter Vue. Run
      // every callback even if one fails so no accepted subtree remains live.
      const errors: unknown[] = [];
      let afterNotify: (() => void) | undefined;
      if (accepted.length > 0 && beforeNotify) {
        try {
          afterNotify = beforeNotify(accepted) ?? undefined;
        } catch (error) {
          errors.push(error);
        }
      }
      for (const stat of accepted) {
        try {
          stat.onAccepted?.();
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        afterNotify?.();
      } catch (error) {
        errors.push(error);
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
