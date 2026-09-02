import Yoga from "yoga-layout";
import { expect, test } from "vite-plus/test";
import type { AppContext } from "../../../src/vue/context.ts";
import { runLayoutTransaction } from "../../../src/layout/layout-transaction.ts";
import { createBox, createRoot, createText, createTextLeaf } from "../../../src/host/nodes.ts";
import { attachYoga, bindTextMeasure, detachYoga } from "../../../src/layout/yoga.ts";

test("fractional text measurement completes in one layout call", () => {
  const root = createRoot({} as AppContext);
  attachYoga(root);

  const row = createBox();
  attachYoga(row);
  row.parent = root;
  row.yoga.setWidth(10);
  root.children.push(row);
  root.yoga.insertChild(row.yoga, 0);

  const column = createBox();
  attachYoga(column);
  column.parent = row;
  column.yoga.setFlexBasisPercent(42.5);
  column.yoga.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN);
  row.children.push(column);
  row.yoga.insertChild(column.yoga, 0);

  const measuredText = createText();
  attachYoga(measuredText);
  bindTextMeasure(measuredText);
  measuredText.parent = column;
  column.children.push(measuredText);
  column.yoga.insertChild(measuredText.yoga, 0);

  const leaf = createTextLeaf("build");
  leaf.parent = measuredText;
  measuredText.children.push(leaf);

  let layoutCalls = 0;
  const realCalculateLayout = root.yoga.calculateLayout.bind(root.yoga);
  (root.yoga as { calculateLayout: (...args: unknown[]) => unknown }).calculateLayout = (
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
  } finally {
    layout.dispose();
    column.yoga.removeChild(measuredText.yoga);
    detachYoga(measuredText);
    root.yoga.freeRecursive();
  }
});
