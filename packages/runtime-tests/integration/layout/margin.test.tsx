import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("margin top", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box marginTop={2}>
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\nX");
});
