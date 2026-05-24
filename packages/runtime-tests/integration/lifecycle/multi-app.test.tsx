import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text } from "@vue-tui/runtime";

test("two concurrent render() calls coexist independently", async () => {
  const App = defineComponent(() => () => <Text>hello</Text>);

  const a = await render(App);
  const b = await render(App);

  expect(a.lastFrame()).toContain("hello");
  expect(b.lastFrame()).toContain("hello");

  a.unmount();
  expect(b.lastFrame()).toContain("hello");

  b.unmount();
});
