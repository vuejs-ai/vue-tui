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
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\nB\n\n");
});

// A zero-width inner content rect has no legal child paint area. Children must
// neither paint nor reserve the extra rows Ink's zero-width wrapping creates.
test("zero flexBasis hides children and does not reserve invisible rows", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexBasis={0}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("B");
});

test("zero-width Box hides children and does not reserve invisible rows (width={0})", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6}>
        <Box width={0}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("B");
});

test('zero-percent-width Box hides children and does not reserve invisible rows (width="0%")', async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6}>
        <Box width="0%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("B");
});

test("zero-width Box with EMPTY text adds no spurious row", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6}>
        <Box width={0}>
          <Text>{""}</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Ink v7.0.4 renders "B": empty text measures width 0 (≤ 0), so it never wraps and
  // never gains a second row. The 0-width fix must NOT add a blank row here.
  expect(lastFrame({ trimLines: true })).toBe("B");
});

test("zero-width Box with backgroundColor hides children and does not reserve invisible rows", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box width={0} backgroundColor="red">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ raw: true })).toBe("B");
});

test("zero-width Box hides nested Box children and does not reserve invisible rows", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box width={0}>
          <Box borderStyle="single">
            <Text>A</Text>
          </Box>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("B");
});
