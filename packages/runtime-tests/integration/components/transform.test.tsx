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

// Resolved: Transform nodes are now yoga carriers, so multi-line text
// under a Transform node is properly laid out. See transform-yoga.test.tsx.

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

test("nested transforms apply inner-first: outer wraps inner result", async () => {
  const outer = (s: string) => `(${s})`;
  const inner = (s: string) => `{${s}}`;

  const App = defineComponent(() => () => (
    <Transform transform={outer}>
      <Transform transform={inner}>
        <Text>x</Text>
      </Transform>
    </Transform>
  ));
  const { lastFrame } = await render(App, { columns: 100 });
  // With prepend [node.transform, ...transformers]:
  // Inner: transformers = [inner, outer]
  // Apply left-to-right: inner("x") = "{x}", then outer("{x}") = "({x})"
  expect(lastFrame()).toBe("({x})");
});
