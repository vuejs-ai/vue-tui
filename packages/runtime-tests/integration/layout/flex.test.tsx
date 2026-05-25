import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("grow equally", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexGrow={1}>
          <Text>A</Text>
        </Box>
        <Box flexGrow={1}>
          <Text>B</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A  B");
});

test("grow one element", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexGrow={1}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A    B");
});

test("do not shrink", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={16}>
        <Box flexShrink={0} width={6}>
          <Text>A</Text>
        </Box>
        <Box flexShrink={0} width={6}>
          <Text>B</Text>
        </Box>
        <Box width={6}>
          <Text>C</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A     B     C");
});

test("shrink equally", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={10}>
        <Box flexShrink={1} width={6}>
          <Text>A</Text>
        </Box>
        <Box flexShrink={1} width={6}>
          <Text>B</Text>
        </Box>
        <Text>C</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A    B   C");
});

test('set flex basis with flexDirection="row" container', async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexBasis={3}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A  B");
});

test('set flex basis in percent with flexDirection="row" container', async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexBasis="50%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A  B");
});

test('set flex basis with flexDirection="column" container', async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={6} flexDirection="column">
        <Box flexBasis={3}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Ink: "A\n\n\nB\n\n" — trailing newlines trimmed by lastFrame({ trimLines: true })
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\nB");
});

test('set flex basis in percent with flexDirection="column" container', async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={6} flexDirection="column">
        <Box flexBasis="50%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Ink: "A\n\n\nB\n\n" — trailing newlines trimmed by lastFrame({ trimLines: true })
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\nB");
});
