import Yoga from "yoga-layout";
import { expect, test } from "vite-plus/test";
import { attachYoga, detachYoga, getTextMeasureCellWidth } from "../../../src/layout/yoga.ts";
import { runLayoutTransaction } from "../../../src/layout/layout-transaction.ts";
import { createRoot, createText, createTextLeaf } from "../../../src/host/nodes.ts";
import { buildNodeOps } from "../../../src/vue/node-ops.ts";

test.each([
  {
    name: "undefined width keeps the natural width",
    availableWidth: Number.NaN,
    widthMode: Yoga.MEASURE_MODE_UNDEFINED,
    expected: 6,
  },
  {
    name: "an AtMost zero allocation stays zero",
    availableWidth: 0,
    widthMode: Yoga.MEASURE_MODE_AT_MOST,
    expected: 0,
  },
  {
    name: "an Exactly zero allocation stays zero",
    availableWidth: 0,
    widthMode: Yoga.MEASURE_MODE_EXACTLY,
    expected: 0,
  },
  {
    name: "a positive sub-cell allocation gets one terminal cell",
    availableWidth: 0.5,
    widthMode: Yoga.MEASURE_MODE_AT_MOST,
    expected: 1,
  },
  {
    name: "a fractional AtMost allocation uses only its complete terminal cells",
    availableWidth: 4.25,
    widthMode: Yoga.MEASURE_MODE_AT_MOST,
    expected: 4,
  },
  {
    name: "a fractional Exactly allocation uses only its complete terminal cells",
    availableWidth: 4.25,
    widthMode: Yoga.MEASURE_MODE_EXACTLY,
    expected: 4,
  },
])("$name", ({ availableWidth, widthMode, expected }) => {
  expect(getTextMeasureCellWidth(6, availableWidth, widthMode)).toBe(expected);
});

test("a Text node's content parses once per content revision", () => {
  const ops = buildNodeOps({ onCommit: () => {} });
  const root = createRoot({} as never);
  attachYoga(root);
  const text = ops.createElement("tui-text") as ReturnType<typeof createText>;
  const leaf = ops.createText("hello") as ReturnType<typeof createTextLeaf>;
  ops.insert(text, root, null);
  ops.insert(leaf, text, null);

  const commit = (): void => {
    runLayoutTransaction({
      dynamicRoot: root,
      staticRoots: [],
      columns: 20,
      dynamicHeight: { mode: "exact", rows: 5 },
    }).dispose();
  };

  try {
    commit();
    const parsed = text.content;
    expect(parsed?.text).toBe("hello");
    expect(parsed?.runs).toHaveLength(5);

    // A paint-only prop composes over the same runs.
    ops.patchProp(text, "color", null, "red");
    commit();
    expect(text.content).toBe(parsed);

    // Changing what the node holds moves the revision, and the parse follows.
    ops.setText(leaf, "changed");
    commit();
    expect(text.content).not.toBe(parsed);
    expect(text.content?.text).toBe("changed");
  } finally {
    ops.remove(text);
    detachYoga(root);
  }
});
