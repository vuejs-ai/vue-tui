import type { TuiBox, TuiNode } from "../host/nodes.ts";

/** Geometry facts paint records for the mounted session after a successful frame. */
export interface PaintGeometryFrame {
  /** True when this target or one of its descendants was observed at frame start. */
  hasObservedSubtree(target: TuiNode): boolean;
  record(target: TuiBox, width: number, height: number, left: number, top: number): void;
  recordSubtree(target: TuiNode, status: "hidden" | "unavailable"): void;
}
