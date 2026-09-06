import type { LayoutTransactionResult } from "../layout/layout-transaction.ts";
import type { TuiNode, TuiStatic } from "../host/nodes.ts";
import type { Frame } from "../frame/frame.ts";
import { paintStaticLayout } from "./paint.ts";

export function findStatics(root: TuiNode, out: TuiStatic[] = []): TuiStatic[] {
  if (root.type === "tui-static") out.push(root);
  if (root.type !== "text-leaf" && root.type !== "comment") {
    const containerChildren = (root as { children: TuiNode[] }).children;
    for (const child of containerChildren) findStatics(child, out);
  }
  return out;
}

interface PreparedStaticBatch {
  readonly stat: TuiStatic;
  readonly frame: Frame | undefined;
}

/**
 * One candidate Static output transaction. Preparation does not change any
 * host's write-once state. `accept()` seals every prepared host before notifying
 * components; `abandon()` seals them without notification after an indeterminate
 * throwing write.
 */
export interface PreparedStaticOutput {
  /** Open Static pictures in their terminal-history order. */
  readonly frames: readonly Frame[];
  /**
   * Confirm every non-empty block represented in this prepared transaction.
   * A preparation hook may return a finalizer that runs after every component
   * has received its acceptance notification, including when one throws.
   */
  accept(beforeNotify?: (accepted: readonly TuiStatic[]) => void | (() => void)): void;
  /** Prevent retry for every non-empty block in an indeterminate transaction. */
  abandon(): void;
}

/** Prepare every currently open Static region as one ordered output transaction. */
export function prepareStaticOutput(layout: LayoutTransactionResult): PreparedStaticOutput {
  const batches = layout.staticLayouts.map(
    ({ stat, region }): PreparedStaticBatch => ({
      stat,
      frame: region ? paintStaticLayout(region, layout.computed) : undefined,
    }),
  );
  // An output-free instance is still a producer: it remains open until a later
  // eligible render produces bytes, or ordinary Vue unmount removes it. Only
  // blocks represented in this transaction may be accepted or abandoned.
  // "Produced output" is what makes a block committable, and blank rows are
  // output: a block of them advances the cursor and occupies history, so its
  // instance must settle rather than stay open forever, retaining its subtree
  // and repainting on every later commit. Rows past the first contribute their
  // newlines even when no cell in them is inked; a single blank row encodes to
  // nothing and leaves the producer open, as an empty block does.
  const committableBatches = batches.filter(
    ({ frame }) => frame !== undefined && (frame.hasContent() || frame.height > 1),
  );
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
    frames: committableBatches.map(({ frame }) => frame!),
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
