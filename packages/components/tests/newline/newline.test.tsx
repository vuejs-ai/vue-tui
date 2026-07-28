import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text } from "@vue-tui/runtime";
import { Newline } from "../../src/index.ts";

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
