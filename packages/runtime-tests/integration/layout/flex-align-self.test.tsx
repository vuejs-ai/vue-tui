import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, Newline } from "@vue-tui/runtime";

test("row - align text to center", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" height={3}>
        <Box alignSelf="center">
          <Text>Test</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\nTest\n");
});

test("row - align multiple text nodes to center", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" height={3}>
        <Box alignSelf="center" flexDirection="row">
          <Text>A</Text>
          <Text>B</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\nAB\n");
});

test("row - align text to bottom", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" height={3}>
        <Box alignSelf="flex-end">
          <Text>Test</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\nTest");
});

test("row - align multiple text nodes to bottom", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" height={3}>
        <Box alignSelf="flex-end" flexDirection="row">
          <Text>A</Text>
          <Text>B</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\nAB");
});

test("column - align text to center", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" width={10}>
        <Box alignSelf="center">
          <Text>Test</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("   Test");
});

test("column - align text to right", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" width={10}>
        <Box alignSelf="flex-end">
          <Text>Test</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("      Test");
});

test("column - align self stretch", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" width={7}>
        <Box alignSelf="stretch" borderStyle="single">
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("┌─────┐\n│X    │\n└─────┘");
});

test("row - align self stretch", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" height={5}>
        <Box alignSelf="stretch" borderStyle="single">
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("┌─┐\n│X│\n│ │\n│ │\n└─┘");
});

test("row - align self baseline", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" alignItems="flex-end" height={3}>
        <Text>
          A
          <Newline />B
        </Text>
        <Box alignSelf="baseline">
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AX\nB\n");
});
