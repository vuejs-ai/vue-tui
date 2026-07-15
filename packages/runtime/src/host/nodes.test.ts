import { expect, test } from "vite-plus/test";
import Yoga from "yoga-layout";
import { createBox, createText, createTextLeaf, createTransform, isContainer } from "./nodes.ts";
import { buildNodeOps } from "./node-ops.ts";

test("createBox returns shape with empty children + paintDirty true", () => {
  const box = createBox();
  expect(box.type).toBe("tui-box");
  expect(box.children).toEqual([]);
  expect(box.paintDirty).toBe(true);
  expect(box.parent).toBe(null);
  expect(box.props).toEqual({});
  expect(box.style.display).toBe("");
  expect(Object.keys(box)).not.toContain("style");
});

test("Box style.display maps Vue v-show writes onto Yoga display", () => {
  let commits = 0;
  const ops = buildNodeOps({ onCommit: () => commits++ });
  const box = ops.createElement("tui-box") as ReturnType<typeof createBox>;

  expect(box.style.display).toBe("");
  expect(Object.keys(box)).not.toContain("style");
  expect(box.yoga.getDisplay()).toBe(Yoga.DISPLAY_FLEX);

  box.style.display = "none";
  expect(box.style.display).toBe("none");
  expect(box.yoga.getDisplay()).toBe(Yoga.DISPLAY_NONE);
  expect(commits).toBe(1);

  box.style.display = "";
  expect(box.style.display).toBe("");
  expect(box.yoga.getDisplay()).toBe(Yoga.DISPLAY_FLEX);
  expect(commits).toBe(2);
});

test("Box display prop stays hidden under v-show and restores its latest value", () => {
  const ops = buildNodeOps({ onCommit: () => {} });
  const box = ops.createElement("tui-box") as ReturnType<typeof createBox>;

  ops.patchProp(box, "display", undefined, "flex");
  box.style.display = "none";
  expect(box.yoga.getDisplay()).toBe(Yoga.DISPLAY_NONE);

  // A prop update while v-show is still false must not reveal the subtree.
  ops.patchProp(box, "display", "flex", "none");
  ops.patchProp(box, "display", "none", "flex");
  expect(box.style.display).toBe("none");
  expect(box.yoga.getDisplay()).toBe(Yoga.DISPLAY_NONE);

  // Vue restores the original style string when v-show becomes true. The host
  // reveals using the latest authored Box prop, not a stale mount-time value.
  box.style.display = "flex";
  expect(box.style.display).toBe("flex");
  expect(box.yoga.getDisplay()).toBe(Yoga.DISPLAY_FLEX);

  // Authored display=none wins even while v-show itself is true.
  ops.patchProp(box, "display", "flex", "none");
  box.style.display = "flex";
  expect(box.style.display).toBe("none");
  expect(box.yoga.getDisplay()).toBe(Yoga.DISPLAY_NONE);
});

test("Box style.display becomes inert before its Yoga node is freed", () => {
  let commits = 0;
  const ops = buildNodeOps({ onCommit: () => commits++ });
  const parent = ops.createElement("tui-box") as ReturnType<typeof createBox>;
  const child = ops.createElement("tui-box") as ReturnType<typeof createBox>;
  ops.insert(child, parent, null);
  ops.remove(child);
  const commitsAfterRemoval = commits;

  expect(() => {
    child.style.display = "none";
  }).not.toThrow();
  expect(commits).toBe(commitsAfterRemoval);
});

test("createTextLeaf carries its value", () => {
  const leaf = createTextLeaf("hello");
  expect(leaf.type).toBe("text-leaf");
  expect(leaf.value).toBe("hello");
  expect(leaf.parent).toBe(null);
});

test("text measurement reuses one revision and invalidates after a text update", () => {
  const ops = buildNodeOps({ onCommit: () => {} });
  const text = ops.createElement("tui-text") as ReturnType<typeof createText>;
  const leaf = ops.createText("hello") as ReturnType<typeof createTextLeaf>;
  ops.insert(leaf, text, null);
  text.yoga.calculateLayout(20, undefined, Yoga.DIRECTION_LTR);
  expect(text.measuredCache).toBe("hello");

  text.measuredCache = "sentinel";
  text.yoga.markDirty();
  text.yoga.calculateLayout(20, undefined, Yoga.DIRECTION_LTR);
  expect(text.measuredCache).toBe("sentinel");

  ops.setText(leaf, "changed");
  text.yoga.calculateLayout(20, undefined, Yoga.DIRECTION_LTR);
  expect(text.measuredCache).toBe("changed");
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

test("setText re-validates a leaf that mounts empty then becomes non-empty under a box", () => {
  // Bug (setText hole): an empty text-leaf mounts as a Vue fragment anchor —
  // insert() exempts empty leaves — directly inside a <Box>. When it LATER becomes
  // non-empty via setText, it must be re-validated with the SAME rejectsTextLeaf
  // check insert()/setElementText() use, or non-empty bare text would sit under the
  // box and paint would silently drop it. (The same content mounted non-empty
  // throws at insert — setText must agree.)
  const ops = buildNodeOps({ onCommit: () => {} });
  const box = ops.createElement("tui-box") as ReturnType<typeof createBox>;
  const leaf = ops.createText("") as ReturnType<typeof createTextLeaf>;

  // Empty leaf is exempt → mounts fine as an anchor.
  expect(() => ops.insert(leaf, box, null)).not.toThrow();
  expect(box.children.length).toBe(1);

  // Going non-empty must throw the SAME error insert() throws for non-empty text.
  expect(() => ops.setText(leaf, "hi")).toThrow(
    /^Text string "hi" must be rendered inside <Text> component$/,
  );
});

test("non-empty text directly under a box still throws at insert (control)", () => {
  // Sanity anchor for the bug above: identical content mounted non-empty is
  // rejected at insert — so setText going ''->'hi' must reject too.
  const ops = buildNodeOps({ onCommit: () => {} });
  const box = ops.createElement("tui-box") as ReturnType<typeof createBox>;
  expect(() => ops.insert(ops.createText("hi"), box, null)).toThrow(
    /^Text string "hi" must be rendered inside <Text> component$/,
  );
});

test("setText to non-empty inside a tui-text does NOT throw", () => {
  // A leaf inside a <Text> is valid inline text (rejectsTextLeaf returns false for
  // a tui-text parent), so the new re-validation must be a no-op here.
  const ops = buildNodeOps({ onCommit: () => {} });
  const text = ops.createElement("tui-text") as ReturnType<typeof createBox>;
  const leaf = ops.createText("") as ReturnType<typeof createTextLeaf>;
  ops.insert(leaf, text, null);

  expect(() => ops.setText(leaf, "hi")).not.toThrow();
  expect(leaf.value).toBe("hi");
});

test("setText back to empty under a box does NOT throw", () => {
  // Clearing a leaf to "" is the fragment-anchor case again — exempt, no throw.
  const ops = buildNodeOps({ onCommit: () => {} });
  const box = ops.createElement("tui-box") as ReturnType<typeof createBox>;
  const leaf = ops.createText("") as ReturnType<typeof createTextLeaf>;
  ops.insert(leaf, box, null);

  expect(() => ops.setText(leaf, "")).not.toThrow();
  expect(leaf.value).toBe("");
});

test("setText on a detached leaf (no parent) does NOT throw", () => {
  // A leaf with parent === null has no context to validate against; the guard
  // must skip it rather than crash.
  const ops = buildNodeOps({ onCommit: () => {} });
  const leaf = ops.createText("") as ReturnType<typeof createTextLeaf>;
  expect(leaf.parent).toBe(null);
  expect(() => ops.setText(leaf, "hi")).not.toThrow();
  expect(leaf.value).toBe("hi");
});
