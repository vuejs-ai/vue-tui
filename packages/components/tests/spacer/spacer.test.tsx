import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";
import { Spacer } from "../../src/index.ts";

test("Spacer pushes row siblings to the container edges", async () => {
  const App = defineComponent(() => () => (
    <Box width={11}>
      <Text>L</Text>
      <Spacer />
      <Text>R</Text>
    </Box>
  ));

  const { lastFrame, dispose } = await render(App);
  expect(lastFrame().split("\n")[0]?.trimEnd()).toBe("L         R");
  dispose();
});

test("Spacer pushes column siblings to the container edges", async () => {
  const App = defineComponent(() => () => (
    <Box flexDirection="column" height={4}>
      <Text>top</Text>
      <Spacer />
      <Text>bottom</Text>
    </Box>
  ));

  const { lastFrame, dispose } = await render(App);
  expect(
    lastFrame()
      .split("\n")
      .map((line) => line.trimEnd()),
  ).toEqual(["top", "", "", "bottom"]);
  dispose();
});
