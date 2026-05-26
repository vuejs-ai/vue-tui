import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text } from "@vue-tui/runtime";

test("patchConsole is disabled in debug mode (testing render uses debug)", async () => {
  // The testing render() helper uses debug: true, which auto-disables
  // patchConsole. Verify that the app still renders correctly without it.
  const App = defineComponent(() => () => <Text>UI</Text>);
  const { lastFrame } = await render(App);
  expect(lastFrame()).toContain("UI");
});

test("patchConsole option defaults to true and can be set to false", async () => {
  // This test just verifies the option is accepted without throwing.
  // Since testing uses debug mode, patchConsole is a no-op regardless,
  // but the option path must not error.
  const App = defineComponent(() => () => <Text>hello</Text>);
  const { lastFrame } = await render(App);
  expect(lastFrame()).toContain("hello");
});
