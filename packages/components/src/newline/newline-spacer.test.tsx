import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";
import { Newline, Spacer } from "../index.ts";

test("Newline breaks Text content at the requested count", async () => {
  const App = defineComponent(() => () => (
    <Text>
      one
      <Newline />
      two
      <Newline count={2} />
      three
    </Text>
  ));

  const { lastFrame, dispose } = await render(App);
  expect(
    lastFrame()
      .split("\n")
      .map((line) => line.trimEnd()),
  ).toEqual(["one", "two", "", "three"]);
  dispose();
});

test("Newline count 0 emits nothing", async () => {
  const App = defineComponent(() => () => (
    <Text>
      a
      <Newline count={0} />b
    </Text>
  ));

  const { lastFrame, dispose } = await render(App);
  expect(lastFrame().trimEnd()).toBe("ab");
  dispose();
});

test("Newline rejects a non-integer or negative count", async () => {
  for (const count of [-1, 1.5, Number.NaN]) {
    const App = defineComponent(() => () => (
      <Text>
        <Newline count={count} />
      </Text>
    ));
    await expect(render(App)).rejects.toThrow('prop "count"');
  }
});

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
