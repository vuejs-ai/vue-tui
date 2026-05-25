import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, Transform } from "@vue-tui/runtime";

test("Transform uppercases descendant text", async () => {
  const { lastFrame } = await render(() => (
    <Transform transform={(line: string) => line.toUpperCase()}>
      <Text>abc</Text>
    </Transform>
  ));
  expect(lastFrame()).toContain("ABC");
});

// --- Ink transform tests ---

// NOTE: Tests that use <Transform> inside <Text> (i.e. a transform node as a
// child of a text node) are marked todo. vue-tui's renderTextWithInlineStyles
// only handles text-leaf and virtual-text children; transform nodes nested
// inside a text node are not supported in the current paint pass.

test.todo("transform children — <Transform> inside <Text> not supported in paint pass");

test.todo("squash multiple text nodes — <Transform> inside <Text> not supported in paint pass");

test.todo(
  "transform with multiple lines — transform nodes are not yoga carriers; root yoga height does not account for multi-line text under a transform node",
);

test.todo(
  "squash multiple nested text nodes — <Transform> inside <Text> not supported in paint pass",
);

test.todo("squash empty <Text> nodes — <Transform> inside <Text> not supported in paint pass");

test("<Transform> with undefined children", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Transform transform={(s: string) => s} />),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("");
});

test("<Transform> with null children", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Transform transform={(s: string) => s} />),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("");
});
