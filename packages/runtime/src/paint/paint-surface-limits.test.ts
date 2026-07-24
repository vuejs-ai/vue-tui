import Yoga from "yoga-layout";
import { expect, test } from "vite-plus/test";
import type { AppContext } from "../context.ts";
import { createRoot } from "../host/nodes.ts";
import { attachYoga, detachYoga } from "../host/yoga.ts";
import { MAX_PAINT_SURFACE_CELLS, assertPaintSurfaceSize } from "../numeric-limits.ts";
import { paint, releasePaintCaches } from "./paint.ts";

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
  root.yoga.setWidth(1_024);
  root.yoga.setHeight(1_025);
  root.yoga.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);

  try {
    expect(() => paint(root)).toThrow(
      new RangeError("Paint surface 1024x1025 exceeds the 1048576-cell resource limit."),
    );
  } finally {
    releasePaintCaches(root);
    detachYoga(root);
  }
});
