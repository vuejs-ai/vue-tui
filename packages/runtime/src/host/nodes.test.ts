import { expect, test } from "vite-plus/test";
import { createBox, createTextLeaf, createTransform, isContainer } from "./nodes.ts";
import { buildNodeOps } from "./node-ops.ts";

test("createBox returns shape with empty children + paintDirty true", () => {
  const box = createBox();
  expect(box.type).toBe("box");
  expect(box.children).toEqual([]);
  expect(box.paintDirty).toBe(true);
  expect(box.parent).toBe(null);
  expect(box.props).toEqual({});
});

test("createTextLeaf carries its value", () => {
  const leaf = createTextLeaf("hello");
  expect(leaf.type).toBe("text-leaf");
  expect(leaf.value).toBe("hello");
  expect(leaf.parent).toBe(null);
});

test("createTextLeaf coerces a non-string value to a string (Ink setTextNodeValue)", () => {
  // TS-bypass: the host text sink is typed as string, but Ink's setTextNodeValue
  // coerces any non-string at the single sink (dom.ts), so the host must match.
  const leaf = createTextLeaf(5 as unknown as string);
  expect(leaf.value).toBe("5");
});

test("setText coerces a non-string value to a string (Ink setTextNodeValue)", () => {
  const ops = buildNodeOps({ onCommit: () => {} });
  const leaf = ops.createText("hello") as ReturnType<typeof createTextLeaf>;
  // TS-bypass: same as above — exercise the update path's coercion.
  ops.setText(leaf, 5 as unknown as string);
  expect(leaf.value).toBe("5");
});

test("createTransform stores its transform function", () => {
  const fn = (line: string) => line.toUpperCase();
  const node = createTransform(fn);
  expect(node.type).toBe("transform");
  expect(node.transform).toBe(fn);
});

test("isContainer rejects text-leaf and accepts box", () => {
  expect(isContainer(createBox())).toBe(true);
  expect(isContainer(createTextLeaf("x"))).toBe(false);
});
