import { expect, test } from "vite-plus/test";
import { createText, createTextLeaf } from "../host/nodes.ts";
import { deriveTextGeometry } from "./paint-geometry.ts";

test("selection-only text mapping reuses one local generation and projects changed origins", () => {
  const node = createText();
  const leaf = createTextLeaf("A你");
  node.children.push(leaf);
  leaf.parent = node;
  const key = {};
  const base = {
    node,
    renderedText: "A你",
    wrapped: ["A你"],
    wrapWidth: 3,
    wrapMode: "wrap" as const,
    selectionTargets: [{ key, node }],
    geometryRequested: false,
  };

  const first = deriveTextGeometry({ ...base, surfaceOrigin: { x: 0, y: 0 } });
  const repeated = deriveTextGeometry({ ...base, surfaceOrigin: { x: 0, y: 0 } });
  expect(repeated).toBe(first);

  const shifted = deriveTextGeometry({ ...base, surfaceOrigin: { x: 4, y: -2 } });
  expect(shifted).not.toBe(first);
  expect(shifted.selection.get(key)?.cells).toEqual([
    expect.objectContaining({ text: "A", x: 4, y: -2 }),
    expect.objectContaining({ text: "你", x: 5, y: -2, width: 2 }),
  ]);
  expect(deriveTextGeometry({ ...base, surfaceOrigin: { x: 4, y: -2 } })).toBe(shifted);

  node.textRevision++;
  expect(deriveTextGeometry({ ...base, surfaceOrigin: { x: 4, y: -2 } })).not.toBe(shifted);
});
