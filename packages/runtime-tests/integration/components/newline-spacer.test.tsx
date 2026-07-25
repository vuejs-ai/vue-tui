import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("Text content composes an explicit newline", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text>{`Hello\nWorld`}</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello\nWorld");
});

test("Text content composes repeated newlines", async () => {
  const count = 2;
  const { lastFrame } = await render(
    defineComponent(() => () => <Text>{`Hello${"\n".repeat(count)}World`}</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello\n\nWorld");
});

test("an empty growing Box pushes row siblings apart", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>Left</Text>
        <Box flexGrow={1} flexShrink={1} />
        <Text>Right</Text>
      </Box>
    )),
    { columns: 20 },
  );
  expect(lastFrame()).toBe("Left           Right");
});

test("an empty growing Box pushes column siblings apart", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" height={6}>
        <Text>Top</Text>
        <Box flexGrow={1} flexShrink={1} />
        <Text>Bottom</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Top\n\n\n\n\nBottom");
});
