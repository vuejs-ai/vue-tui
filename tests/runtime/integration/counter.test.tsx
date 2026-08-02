import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useInput } from "@vue-tui/runtime";

test("counter responds to arrow keys", async () => {
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

  const { lastFrame, stdin } = await render(Counter);
  expect(lastFrame()).toContain("Count: 0");

  await stdin.write("\x1b[A");
  expect(lastFrame()).toContain("Count: 1");

  await stdin.write("\x1b[A");
  await stdin.write("\x1b[A");
  expect(lastFrame()).toContain("Count: 3");

  await stdin.write("\x1b[B");
  expect(lastFrame()).toContain("Count: 2");
});
