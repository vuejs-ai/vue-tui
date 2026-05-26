import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useIsScreenReaderEnabled } from "@vue-tui/runtime";

test("useIsScreenReaderEnabled returns false by default", async () => {
  let result = false;
  const App = defineComponent(() => {
    result = useIsScreenReaderEnabled();
    return () => <Text>sr test</Text>;
  });
  await render(App);
  expect(result).toBe(false);
});
