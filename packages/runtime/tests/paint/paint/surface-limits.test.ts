import { expect, test } from "vite-plus/test";
import type { AppContext } from "../../../src/vue/context.ts";
import { createRoot } from "../../../src/host/nodes.ts";
import { runLayoutTransaction } from "../../../src/layout/layout-transaction.ts";
import { attachYoga, detachYoga } from "../../../src/layout/yoga.ts";
import {
  MAX_PAINT_SURFACE_CELLS,
  assertPaintSurfaceSize,
} from "../../../src/paint/surface-limits.ts";
import { paint, releasePaintCaches } from "../../../src/paint/paint.ts";
import { createTerminalStyle } from "../../../src/text/terminal-style.ts";

const terminalStyle = createTerminalStyle(3);

test("accepts the exact paint-surface resource boundary without allocating it", () => {
  expect(() => assertPaintSurfaceSize(1_024, 1_024)).not.toThrow();
  expect(1_024 * 1_024).toBe(MAX_PAINT_SURFACE_CELLS);
  expect(() => assertPaintSurfaceSize(65_535, 1)).not.toThrow();
});

test("rejects a surface dimension outside the terminal-sized layout range", () => {
  expect(() => assertPaintSurfaceSize(65_536, 1)).toThrow(
    new RangeError(
      "Paint surface dimensions must be integers between 1 and 65535; received 65536x1.",
    ),
  );
});

test("paint rejects an oversized surface with a Runtime error before grid allocation", () => {
  const root = createRoot({} as AppContext);
  attachYoga(root);
  const layout = runLayoutTransaction({
    dynamicRoot: root,
    staticRoots: [],
    columns: 1_024,
    dynamicHeight: { mode: "exact", rows: 1_025 },
  });

  try {
    expect(() => paint(root, { layout: layout.computed, terminalStyle })).toThrow(
      new RangeError("Paint surface 1024x1025 exceeds the 1048576-cell resource limit."),
    );
  } finally {
    layout.dispose();
    releasePaintCaches(root);
    detachYoga(root);
  }
});
