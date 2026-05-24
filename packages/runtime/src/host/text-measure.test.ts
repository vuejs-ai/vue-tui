import { expect, test } from "vite-plus/test";
import { createText, createTextLeaf, createVirtualText } from "./nodes.ts";
import { flattenLeaves, wrapText } from "./text-measure.ts";

test("flattenLeaves concatenates a flat text node", () => {
  const t = createText();
  const a = createTextLeaf("hello ");
  const b = createTextLeaf("world");
  a.parent = t;
  b.parent = t;
  t.children = [a, b];
  expect(flattenLeaves(t)).toBe("hello world");
});

test("flattenLeaves recurses into virtual-text", () => {
  const t = createText();
  const v = createVirtualText();
  const a = createTextLeaf("a");
  const b = createTextLeaf("b");
  v.children = [b];
  b.parent = v;
  v.parent = t;
  t.children = [a, v];
  a.parent = t;
  expect(flattenLeaves(t)).toBe("ab");
});

test("wrapText splits on width", () => {
  expect(wrapText("hello world", 5, "wrap")).toEqual(["hello", "world"]);
});

test("wrapText truncate-end cuts with ellipsis", () => {
  expect(wrapText("abcdefgh", 5, "truncate-end")).toEqual(["abcd…"]);
});
