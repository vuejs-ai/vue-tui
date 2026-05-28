import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("<Box> inside <Text> throws an error", async () => {
  const App = defineComponent(() => () => (
    <Text>
      <Box />
    </Text>
  ));

  await expect(render(App)).rejects.toThrow("can’t be nested inside <Text>");
});

test("fail when text nodes are not within <Text> component (mixed)", async () => {
  const App = defineComponent(() => () => (
    <Box>
      Hello
      <Text>World</Text>
    </Box>
  ));
  await expect(render(App)).rejects.toThrow("must be rendered inside <Text>");
});

test("fail when text node is not within <Text> component (full)", async () => {
  const App = defineComponent(() => () => <Box>Hello World</Box>);
  await expect(render(App)).rejects.toThrow("must be rendered inside <Text>");
});
