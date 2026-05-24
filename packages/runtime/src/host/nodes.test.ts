import { expect, test } from "vite-plus/test";
import { createBox, createTextLeaf, createTransform, isContainer } from "./nodes.ts";

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
