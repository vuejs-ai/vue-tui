import type { TuiRoot, TuiStatic } from "../host/nodes.ts";
import type { Frame } from "../frame/frame.ts";
import {
  runLayoutTransaction,
  type LayoutHeightConstraint,
  type LayoutTransactionResult,
} from "../layout/layout-transaction.ts";
import type { PaintGeometryFrame } from "../paint/geometry.ts";
import { paint } from "../paint/paint.ts";
import { prepareStaticOutput, type PreparedStaticOutput } from "../paint/static-channel.ts";
import type { TerminalStyle } from "../text/terminal-style.ts";
import type { InternalFocusController } from "./focus-controller.ts";

export interface RenderCommitRequest {
  readonly dynamicRoot: TuiRoot;
  /** Every `Static` host in the tree; the transaction lays out the open ones. */
  readonly staticRoots: readonly TuiStatic[];
  readonly columns: number;
  readonly dynamicHeight: LayoutHeightConstraint;
  /** Text styling capability resolved for the host that renders this commit. */
  readonly terminalStyle: TerminalStyle;
  /**
   * `"height-constraint"` paints the dynamic frame into `columns` by the rows
   * the constraint resolved to, so a host that owns a fixed terminal region
   * gets a frame clipped and padded to it. `"none"` paints the laid-out
   * picture, leaving any bound on the result to the caller.
   */
  readonly paintViewport: "height-constraint" | "none";
  /** Reconciles rendered availability once the transaction has landed. */
  readonly focusController: InternalFocusController | null;
  /** Frame-local geometry collector; the caller commits or discards it. */
  readonly geometry?: PaintGeometryFrame;
}

export interface RenderCommitResult {
  /** The dynamic picture, absent when the resolved viewport has no rows. */
  readonly frame: Frame | undefined;
  /** The open `Static` pictures in history order, with their settlement. */
  readonly preparedStatic: PreparedStaticOutput;
  /** Final geometry for this commit. The caller disposes it. */
  readonly layout: LayoutTransactionResult;
}

function viewportRowsFor(
  constraint: LayoutHeightConstraint,
  dynamicHeight: number,
): number | undefined {
  if (constraint.mode === "exact") return constraint.rows;
  if (constraint.mode === "at-most") return Math.min(constraint.rows, dynamicHeight);
  return undefined;
}

/**
 * Run one commit's layout and paint: the layout transaction over the dynamic
 * root and the open `Static` roots, then the dynamic frame and each `Static`
 * frame from the resulting `ComputedLayout`.
 *
 * Keeps nothing between calls. Encoding, presentation and `Static` settlement
 * belong to the host that calls this, which also disposes the returned
 * transaction once it no longer needs the frames' geometry.
 */
export function runRenderCommit(request: RenderCommitRequest): RenderCommitResult {
  const layout = runLayoutTransaction({
    dynamicRoot: request.dynamicRoot,
    staticRoots: request.staticRoots,
    columns: request.columns,
    dynamicHeight: request.dynamicHeight,
  });
  try {
    request.focusController?.reconcileAfterLayout();
    const preparedStatic = prepareStaticOutput(layout, request.terminalStyle);
    const viewportRows =
      request.paintViewport === "none"
        ? undefined
        : viewportRowsFor(request.dynamicHeight, layout.dynamicHeight);
    const frame = paint(request.dynamicRoot, {
      layout: layout.computed,
      terminalStyle: request.terminalStyle,
      viewport:
        viewportRows === undefined ? undefined : { width: request.columns, height: viewportRows },
      geometry: request.geometry,
    });
    return {
      // `Frame` cannot have zero rows. Paint still runs to collect geometry,
      // then that synthetic one-row frame is omitted from an empty viewport.
      frame: viewportRows === 0 ? undefined : frame,
      preparedStatic,
      layout,
    };
  } catch (error) {
    layout.dispose();
    throw error;
  }
}
