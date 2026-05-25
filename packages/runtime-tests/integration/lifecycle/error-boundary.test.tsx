import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("render-time throw in nested component rejects waitUntilExit", async () => {
  const trigger = shallowRef(false);

  const Child = defineComponent(() => {
    return () => {
      if (trigger.value) throw new Error("child render boom");
      return <Text>child ok</Text>;
    };
  });

  const App = defineComponent(() => {
    return () => (
      <Box>
        <Child />
      </Box>
    );
  });

  const { lastFrame, waitUntilExit } = await render(App);
  expect(lastFrame()).toContain("child ok");

  // Trigger the error in the child component's render function
  trigger.value = true;
  await nextTick();

  // The error should route through errorHandler → exit(err) → rejects waitUntilExit
  await expect(waitUntilExit()).rejects.toThrow("child render boom");
});
