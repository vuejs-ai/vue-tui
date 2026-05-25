import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

// --- Ink prop-reset test ---
// Tests that removing a prop from an element resets the corresponding yoga layout value.

test("reset prop when it's removed from the element", async () => {
  const remove = shallowRef(false);

  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column" justifyContent="flex-end" height={remove.value ? undefined : 4}>
      <Text>x</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });

  // With height=4 and justifyContent="flex-end", "x" should appear at the bottom
  expect(lastFrame()).toBe("\n\n\nx");

  // Remove the height prop — box collapses to content height, x goes to top
  remove.value = true;
  await nextTick();

  expect(lastFrame()).toBe("x");
});
