import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("row - no wrap", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={2}>
        <Text>A</Text>
        <Text>BC</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("BC\n");
});

test("column - no wrap", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" height={2}>
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("B\nC");
});

test("row - wrap content", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={2} flexWrap="wrap">
        <Text>A</Text>
        <Text>BC</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A\nBC");
});

test("column - wrap content", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" height={2} flexWrap="wrap">
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AC\nB");
});

test("column - wrap content reverse", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" height={2} width={3} flexWrap="wrap-reverse">
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(" CA\n  B");
});

test("row - wrap content reverse", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" height={3} width={2} flexWrap="wrap-reverse">
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\nC\nAB");
});
