import { defineComponent, ref } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useInput } from "@vue-tui/runtime";

test("README quickstart code runs to a Count: 0 frame", async () => {
  const Counter = defineComponent(() => {
    const count = ref(0);
    useInput((input) => {
      if (input === "+") count.value++;
      if (input === "-") count.value--;
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
