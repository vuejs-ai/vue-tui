import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("row - align text to center", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" justifyContent="center" width={10}>
        <Text>Test</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("   Test");
});

test("row - align multiple text nodes to center", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" justifyContent="center" width={10}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("    AB");
});

test("row - align two text nodes on the edges", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" justifyContent="space-between" width={4}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A  B");
});

test("column - align text to center", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" justifyContent="center" height={3}>
        <Text>Test</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\nTest\n");
});

test("column - align two text nodes on the edges", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" justifyContent="space-between" height={4}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\nB");
});
