import { expect, test } from "vite-plus/test";
import { createBox, createTextLeaf, createTransform, isContainer } from "./nodes.ts";
import { buildNodeOps } from "./node-ops.ts";

test("createBox returns shape with empty children + paintDirty true", () => {
  const box = createBox();
  expect(box.type).toBe("tui-box");
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
  expect(node.type).toBe("tui-transform");
  expect(node.transform).toBe(fn);
});

test("isContainer rejects text-leaf and accepts box", () => {
  expect(isContainer(createBox())).toBe(true);
  expect(isContainer(createTextLeaf("x"))).toBe(false);
});

test("setElementText rejecting a non-text container leaves existing children intact", () => {
  // Regression: setElementText used to remove ALL children FIRST, then try to
  // insert the text-leaf — which throws the text-context guard for a non-text
  // container, leaving the box half-cleared (children gone, nothing inserted).
  // The context must be validated BEFORE the destructive remove.
  const ops = buildNodeOps({ onCommit: () => {} });
  const box = ops.createElement("tui-box") as ReturnType<typeof createBox>;
  const child = ops.createElement("tui-text");
  ops.insert(child, box, null);
  expect(box.children.length).toBe(1);

  expect(() => ops.setElementText(box, "hello")).toThrow(/must be rendered inside <Text>/);
  // Key assertion: the rejected insert must not have removed the box's children.
  expect(box.children.length).toBe(1);
  expect(box.children[0]).toBe(child);
});

test("setElementText with empty string clears a non-text container's children", () => {
  // Empty text-leaf is exempted from the text-context guard (Vue's clear path),
  // so this must keep working: children removed, no throw.
  const ops = buildNodeOps({ onCommit: () => {} });
  const box = ops.createElement("tui-box") as ReturnType<typeof createBox>;
  ops.insert(ops.createElement("tui-text"), box, null);
  ops.insert(ops.createElement("tui-text"), box, null);
  expect(box.children.length).toBe(2);

  expect(() => ops.setElementText(box, "")).not.toThrow();
  expect(box.children.length).toBe(1);
  expect((box.children[0] as ReturnType<typeof createTextLeaf>).value).toBe("");
});

test("setElementText on a tui-text replaces its children with the text", () => {
  // A text node IS a text context, so text content is valid and must replace
  // the existing children.
  const ops = buildNodeOps({ onCommit: () => {} });
  const text = ops.createElement("tui-text") as ReturnType<typeof createBox>;
  ops.insert(ops.createText("old"), text, null);

  expect(() => ops.setElementText(text, "hi")).not.toThrow();
  expect(text.children.length).toBe(1);
  expect((text.children[0] as ReturnType<typeof createTextLeaf>).value).toBe("hi");
});
