import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useInput } from "@vue-tui/runtime";

test("README quickstart code runs to a Count: 0 frame", async () => {
  const Counter = defineComponent(() => {
    const count = shallowRef(0);
    useInput((event) => {
      if (event.type === "key") {
        if (event.key.name === "up") count.value++;
        else if (event.key.name === "down") count.value--;
      }
    });
    return () => (
      <Box>
        <Text>Count: {count.value}</Text>
      </Box>
    );
  });

  const { lastFrame } = await render(Counter);
  expect(lastFrame()).toContain("Count: 0");
});
