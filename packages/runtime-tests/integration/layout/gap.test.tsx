import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("column gap", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" gap={1}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A B");
});

test("row gap", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" gap={1}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A\n\nB");
});
