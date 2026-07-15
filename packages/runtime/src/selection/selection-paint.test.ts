import Yoga from "yoga-layout";
import { expect, test } from "vite-plus/test";
import type { AppContext } from "../context.ts";
import { calculateLayoutWithContentGuards } from "../host/layout-guards.ts";
import { buildNodeOps } from "../host/node-ops.ts";
import { createRoot, type TuiText } from "../host/nodes.ts";
import { attachYoga, detachYoga } from "../host/yoga.ts";
import { paint, releasePaintCaches } from "../paint/paint.ts";
import type {
  InternalSelectionPaintFrame,
  InternalSelectionPaintTarget,
  InternalTextSelectionTrace,
} from "./selection-paint.ts";
import type { InternalSelectionSnapshot } from "./selection-policy.ts";

const ops = buildNodeOps({ onCommit: () => {} });

test("paint snapshots reuse local selection trace arrays", () => {
  const root = createRoot({} as AppContext);
  attachYoga(root);
  const text = ops.createElement("tui-text") as TuiText;
  ops.insert(ops.createText("A你B"), text, null);
  ops.insert(text, root, null);
  const target: InternalSelectionPaintTarget = { key: {}, node: text };
  let trace: InternalTextSelectionTrace | null = null;
  let snapshot: InternalSelectionSnapshot | null = null;
  const selection: InternalSelectionPaintFrame = {
    targetsFor(node) {
      return node === text ? [target] : [];
    },
    record(candidate, value) {
      if (candidate === target) trace = value;
    },
    prepare(candidate, value) {
      if (candidate === target) snapshot = value;
      return null;
    },
    accept() {},
    discard() {},
  };
  const restore = calculateLayoutWithContentGuards(root, 8, 5, Yoga.DIRECTION_LTR);

  try {
    paint(root, { viewport: { width: 8, height: 5 }, selection });
    expect(trace).not.toBeNull();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.surfaceOrigin).toBe(trace!.surfaceOrigin);
    expect(snapshot!.stops).toBe(trace!.stops);
    expect(snapshot!.cells).toBe(trace!.cells);
    expect([...snapshot!.visibleCellIds]).toEqual(trace!.cells.map((cell) => cell.id));
  } finally {
    restore();
    releasePaintCaches(root);
    detachYoga(root);
  }
});
