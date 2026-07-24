import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("row - align text to center", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" alignItems="center" height={3}>
        <Text>Test</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\nTest\n");
});

test("row - align multiple text nodes to center", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" alignItems="center" height={3}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\nAB\n");
});

test("column - align text to center", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="center" width={10}>
        <Text>Test</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("   Test");
});

test("row - align items stretch", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" alignItems="stretch" height={5}>
        <Box borderStyle="single">
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("┌─┐\n│X│\n│ │\n│ │\n└─┘");
});

test("row - default align items stretches children", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" height={5}>
        <Box borderStyle="single">
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("┌─┐\n│X│\n│ │\n│ │\n└─┘");
});
