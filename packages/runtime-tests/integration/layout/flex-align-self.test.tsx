import { defineComponent, nextTick, shallowRef } from "vue";
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

// Ink styles.ts:580 maps alignSelf="auto" to yoga's ALIGN_AUTO, which is the
// default — so an explicit alignSelf="auto" must render identically to no
// alignSelf at all (the child stays at the cross-axis start, left-aligned here).
test("column - alignSelf='auto' equals the no-alignSelf default", async () => {
  const { lastFrame: withAuto } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" width={10}>
        <Box alignSelf="auto">
          <Text>Test</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  const { lastFrame: withoutAlign } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" width={10}>
        <Box>
          <Text>Test</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  // Both stay at the start (left) — "auto" is the default, not center/end.
  expect(withAuto({ trimLines: true })).toBe("Test");
  expect(withAuto({ trimLines: true })).toBe(withoutAlign({ trimLines: true }));
});

// G19: removing alignSelf must reset to yoga's ALIGN_AUTO default (per the
// declarative contract render = f(current props)). The child starts flex-end
// (right-aligned in a width-10 column) and reverts to the unaligned default
// (left) once alignSelf is removed.
test("column - alignSelf removal resets to AUTO default (G19)", async () => {
  const aligned = shallowRef(true);
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" width={10}>
        <Box {...(aligned.value ? { alignSelf: "flex-end" } : {})}>
          <Text>Test</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  // flex-end pushes "Test" to the right edge of the width-10 column.
  expect(lastFrame({ trimLines: true })).toBe("      Test");

  aligned.value = false;
  await nextTick();
  // After removal, alignSelf resets to AUTO → back to the left (unaligned default).
  expect(lastFrame({ trimLines: true })).toBe("Test");
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
