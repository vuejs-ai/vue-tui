import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useInput } from "@vue-tui/runtime";

test("README quickstart code runs to a Count: 0 frame", async () => {
  const Counter = defineComponent(() => {
    const count = shallowRef(0);
    useInput((event) => {
      if (event.kind !== "text") return "continue";
      if (event.text === "+") count.value++;
      else if (event.text === "-") count.value--;
      else return "continue";
      return "consume";
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
