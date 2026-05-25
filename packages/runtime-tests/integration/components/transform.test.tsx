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

test("transform children — <Transform> inside <Text>", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Transform transform={(s: string, idx: number) => `[${idx}: ${s}]`}>
        <Text>
          <Transform transform={(s: string, idx: number) => `{${idx}: ${s}}`}>
            <Text>test</Text>
          </Transform>
        </Text>
      </Transform>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("[0: {0: test}]");
});

test("squash multiple text nodes — <Transform> inside <Text>", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Transform transform={(s: string, idx: number) => `[${idx}: ${s}]`}>
        <Text>
          <Transform transform={(s: string, idx: number) => `{${idx}: ${s}}`}>
            <Text>hello world</Text>
          </Transform>
        </Text>
      </Transform>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("[0: {0: hello world}]");
});

test.todo(
  "transform with multiple lines — transform nodes are not yoga carriers; root yoga height does not account for multi-line text under a transform node",
);

test("squash multiple nested text nodes — <Transform> inside <Text>", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Transform transform={(s: string, idx: number) => `[${idx}: ${s}]`}>
        <Text>
          <Transform transform={(s: string, idx: number) => `{${idx}: ${s}}`}>
            hello
            <Text> world</Text>
          </Transform>
        </Text>
      </Transform>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("[0: {0: hello world}]");
});

test("squash empty <Text> nodes — <Transform> inside <Text>", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Transform transform={(s: string) => `[${s}]`}>
        <Text>
          <Transform transform={(s: string) => `{${s}}`}>
            <Text>{[]}</Text>
          </Transform>
        </Text>
      </Transform>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("");
});

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
