import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, Transform } from "@vue-tui/runtime";

test("Transform participates in yoga layout (multi-line text)", async () => {
  // When Transform is a yoga carrier, the root layout height accounts for
  // multi-line text under a Transform node.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Transform transform={(s: string, idx: number) => `[${idx}: ${s}]`}>
        <Text>{"hello\nworld"}</Text>
      </Transform>
    )),
    { columns: 100 },
  );
  // Both lines should be visible with the transform applied
  expect(lastFrame()).toBe("[0: hello]\n[1: world]");
});

test("Transform defaults to flexShrink=1 and flexDirection='row'", async () => {
  // Transform should behave like Ink's ink-text node with these defaults
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={20}>
        <Transform transform={(s: string) => s.toUpperCase()}>
          <Text>hello</Text>
        </Transform>
        <Text> world</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Transform and Text are siblings in a row-direction Box.
  // They should be on the same line.
  expect(lastFrame({ trimLines: true })).toBe("HELLO world");
});
