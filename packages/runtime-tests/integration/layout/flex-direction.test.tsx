import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("direction row", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AB");
});

test("direction column", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A\nB");
});

test("don't squash text nodes when column direction is applied", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A\nB");
});
