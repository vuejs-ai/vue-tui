import Yoga from "yoga-layout";
import { expect, test } from "vite-plus/test";
import type { AppContext } from "../../../src/vue/context.ts";
import {
  runLayoutTransaction,
  type ComputedLayout,
} from "../../../src/layout/layout-transaction.ts";
import { createBox, createRoot, createText, createTextLeaf } from "../../../src/host/nodes.ts";
import { attachYoga, bindTextMeasure, detachYoga, getYogaNode } from "../../../src/layout/yoga.ts";
import { paint } from "../../../src/paint/paint.ts";
import { createColorCapability } from "../../../src/frame/color-profile.ts";
import { encodeFrame } from "../../../src/surface/frame-encoder.ts";

test("fractional text measurement completes in one layout call", () => {
  const root = createRoot({} as AppContext);
  attachYoga(root);

  const row = createBox();
  attachYoga(row);
  row.parent = root;
  getYogaNode(row).setWidth(10);
  root.children.push(row);
  getYogaNode(root).insertChild(getYogaNode(row), 0);

  const column = createBox();
  attachYoga(column);
  column.parent = row;
  getYogaNode(column).setFlexBasisPercent(42.5);
  getYogaNode(column).setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN);
  row.children.push(column);
  getYogaNode(row).insertChild(getYogaNode(column), 0);

  const measuredText = createText();
  attachYoga(measuredText);
  bindTextMeasure(measuredText);
  measuredText.parent = column;
  column.children.push(measuredText);
  getYogaNode(column).insertChild(getYogaNode(measuredText), 0);

  const leaf = createTextLeaf("build");
  leaf.parent = measuredText;
  measuredText.children.push(leaf);

  let layoutCalls = 0;
  const realCalculateLayout = getYogaNode(root).calculateLayout.bind(getYogaNode(root));
  (getYogaNode(root) as { calculateLayout: (...args: unknown[]) => unknown }).calculateLayout = (
    ...args: unknown[]
  ) => {
    layoutCalls++;
    return realCalculateLayout(...(args as Parameters<typeof realCalculateLayout>));
  };

  const layout = runLayoutTransaction({
    dynamicRoot: root,
    staticRoots: [],
    columns: 20,
    dynamicHeight: { mode: "exact", rows: 24 },
  });
  try {
    expect(layoutCalls).toBe(1);
    expect(layout.computed.get(measuredText)?.text?.wrappedLines).toEqual(["buil", "d"]);
  } finally {
    layout.dispose();
    getYogaNode(column).removeChild(getYogaNode(measuredText));
    detachYoga(measuredText);
    getYogaNode(root).freeRecursive();
  }
});

test("paint consumes the wrapped lines captured by the layout transaction", () => {
  const root = createRoot({} as AppContext);
  attachYoga(root);

  const text = createText();
  attachYoga(text);
  bindTextMeasure(text);
  text.parent = root;
  root.children.push(text);
  getYogaNode(root).insertChild(getYogaNode(text), 0);

  const leaf = createTextLeaf("ABCD");
  leaf.parent = text;
  text.children.push(leaf);

  const layout = runLayoutTransaction({
    dynamicRoot: root,
    staticRoots: [],
    columns: 10,
    dynamicHeight: { mode: "exact", rows: 2 },
  });
  try {
    const computed = layout.computed.get(text);
    expect(computed?.text?.wrappedLines).toEqual(["ABCD"]);

    // This mimics a captured layout plan with a different physical row split.
    // Painter must render that snapshot instead of calling wrapText again.
    const snapshot: ComputedLayout = {
      get(node) {
        const nodeLayout = layout.computed.get(node);
        if (node !== text || !nodeLayout?.text) return nodeLayout;
        return {
          ...nodeLayout,
          text: { ...nodeLayout.text, wrappedLines: ["A", "BCD"] },
        };
      },
    };

    expect(encodeFrame(paint(root, { layout: snapshot }), createColorCapability(0))).toBe("A\nBCD");
  } finally {
    layout.dispose();
    getYogaNode(root).removeChild(getYogaNode(text));
    detachYoga(text);
    detachYoga(root);
  }
});

test("a row-direction parent reuses the measured lines across layout passes", () => {
  const root = createRoot({} as AppContext);
  attachYoga(root);

  const row = createBox();
  attachYoga(row);
  row.parent = root;
  getYogaNode(row).setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
  root.children.push(row);
  getYogaNode(root).insertChild(getYogaNode(row), 0);

  const text = createText();
  attachYoga(text);
  bindTextMeasure(text);
  text.parent = row;
  row.children.push(text);
  getYogaNode(row).insertChild(getYogaNode(text), 0);

  const leaf = createTextLeaf("ABCD");
  leaf.parent = text;
  text.children.push(leaf);

  const run = () =>
    runLayoutTransaction({
      dynamicRoot: root,
      staticRoots: [],
      columns: 20,
      dynamicHeight: { mode: "exact", rows: 2 },
    });
  const first = run();
  const firstLines = first.computed.get(text)?.text?.wrappedLines;
  first.dispose();
  const second = run();
  try {
    expect(firstLines).toEqual(["ABCD"]);
    // Yoga measured the text against the row's 20-column budget and then laid it
    // out at its own 4-column width; the lines are the same, so the snapshot must
    // hand paint the same array or paint re-styles an unchanged Text every commit.
    expect(second.computed.get(text)?.text?.wrappedLines).toBe(firstLines);
  } finally {
    second.dispose();
    getYogaNode(row).removeChild(getYogaNode(text));
    detachYoga(text);
    getYogaNode(root).freeRecursive();
  }
});
