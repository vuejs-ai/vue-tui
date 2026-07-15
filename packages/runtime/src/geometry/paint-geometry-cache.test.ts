import { expect, test } from "vite-plus/test";
import { createText, createTextLeaf, createVirtualText } from "../host/nodes.ts";
import { deriveTextGeometry, deriveTextGeometryUncached } from "./paint-geometry.ts";

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
  expect(shifted.selection.get(key)?.surfaceOrigin).toEqual({ x: 4, y: -2 });
  expect(shifted.selection.get(key)?.cells).toEqual([
    expect.objectContaining({ text: "A", x: 0, y: 0 }),
    expect.objectContaining({ text: "你", x: 1, y: 0, width: 2 }),
  ]);
  expect(deriveTextGeometry({ ...base, surfaceOrigin: { x: 4, y: -2 } })).toBe(shifted);

  node.textRevision++;
  expect(deriveTextGeometry({ ...base, surfaceOrigin: { x: 4, y: -2 } })).not.toBe(shifted);
});

test("complete text geometry reuses one layout and projects origin and clip exactly", () => {
  const node = createText();
  const prefix = createTextLeaf("A");
  const nested = createVirtualText();
  const nestedLeaf = createTextLeaf("你B");
  node.children.push(prefix, nested);
  prefix.parent = node;
  nested.parent = node;
  nested.children.push(nestedLeaf);
  nestedLeaf.parent = nested;
  const key = {};
  const base = {
    node,
    renderedText: "A你B",
    wrapped: ["A你", "B"],
    wrapWidth: 3,
    wrapMode: "wrap" as const,
    selectionTargets: [{ key, node }],
    geometryRequested: true,
  };

  const first = deriveTextGeometry({
    ...base,
    surfaceOrigin: { x: 4, y: 2 },
    clip: { x: 4, y: 2, width: 3, height: 2 },
  });
  const repeated = deriveTextGeometry({
    ...base,
    wrapped: [...base.wrapped],
    surfaceOrigin: { x: 4, y: 2 },
    clip: { x: 4, y: 2, width: 3, height: 2 },
  });
  expect(repeated).toBe(first);
  expect(first).toEqual(
    deriveTextGeometryUncached({
      ...base,
      surfaceOrigin: { x: 4, y: 2 },
      clip: { x: 4, y: 2, width: 3, height: 2 },
    }),
  );
  expect(first.selection.get(key)?.surfaceOrigin).toEqual({ x: 4, y: 2 });
  expect(first.selection.get(key)?.stops).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ offset: 2, x: 3, y: 0 }),
      expect.objectContaining({ offset: 2, x: 0, y: 1 }),
    ]),
  );
  expect(first.virtual.get(nested)).toMatchObject({ status: "visible" });

  const clipped = deriveTextGeometry({
    ...base,
    surfaceOrigin: { x: 5, y: 7 },
    clip: { x: 6, y: 7, width: 1, height: 1 },
  });
  expect(clipped).toEqual(
    deriveTextGeometryUncached({
      ...base,
      surfaceOrigin: { x: 5, y: 7 },
      clip: { x: 6, y: 7, width: 1, height: 1 },
    }),
  );
  expect(clipped.topFragments?.every((fragment) => fragment.visibleSurface === null)).toBe(true);
  expect(
    clipped.topCaretSlots?.filter(
      (slot) => slot.surface.y === 7 && (slot.surface.x === 6 || slot.surface.x === 8),
    ),
  ).toEqual([
    expect.objectContaining({ visible: false }),
    expect.objectContaining({ visible: false }),
  ]);
  expect(clipped.virtual.get(nested)).toMatchObject({ status: "fully-clipped" });

  node.textRevision++;
  const rebuilt = deriveTextGeometry({
    ...base,
    surfaceOrigin: { x: 5, y: 7 },
    clip: { x: 6, y: 7, width: 1, height: 1 },
  });
  expect(rebuilt).not.toBe(clipped);
  expect(rebuilt).toEqual(clipped);
});

test("empty nested Text keeps zero-size parent and surface coordinates across projections", () => {
  const node = createText();
  const prefix = createTextLeaf("A");
  const empty = createVirtualText();
  const suffix = createTextLeaf("B");
  node.children.push(prefix, empty, suffix);
  prefix.parent = node;
  empty.parent = node;
  suffix.parent = node;
  const base = {
    node,
    renderedText: "AB",
    wrapped: ["AB"],
    wrapWidth: 2,
    wrapMode: "wrap" as const,
    geometryRequested: true,
  };

  const first = deriveTextGeometry({ ...base, surfaceOrigin: { x: 2, y: 3 } });
  expect(first.virtual.get(empty)).toMatchObject({
    status: "zero-size",
    parent: { x: 1, y: 0, width: 0, height: 0 },
    surface: { x: 3, y: 3, width: 0, height: 0 },
  });

  const shifted = deriveTextGeometry({ ...base, surfaceOrigin: { x: 9, y: -1 } });
  expect(shifted.virtual.get(empty)).toMatchObject({
    status: "zero-size",
    parent: { x: 1, y: 0, width: 0, height: 0 },
    surface: { x: 10, y: -1, width: 0, height: 0 },
  });
  expect(shifted).toEqual(deriveTextGeometryUncached({ ...base, surfaceOrigin: { x: 9, y: -1 } }));
});
