import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("absolute position with top and left offsets", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={5} height={3}>
        <Box position="absolute" top={1} left={2}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n  X\n");
});

test("clears top offset on rerender", async () => {
  const top = shallowRef<number | undefined>(1);

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={5} height={3}>
        <Box position="absolute" top={top.value} left={2}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("\n  X\n");

  top.value = undefined;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("  X\n\n");
});
