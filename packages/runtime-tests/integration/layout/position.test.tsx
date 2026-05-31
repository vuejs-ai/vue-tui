import { defineComponent, shallowRef, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("absolute position with top and left offsets", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={5} height={3}>
        <Box position="absolute" top={1} left={2}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n  X\n");
});

test("absolute position with bottom and right offsets", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6} height={4}>
        <Box position="absolute" bottom={1} right={1}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\n    X\n");
});

test("absolute position with percentage offsets", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6} height={4}>
        <Box position="absolute" top="50%" left="50%">
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\n   X\n");
});

test("absolute position with percentage bottom and right offsets", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6} height={4}>
        <Box position="absolute" bottom="50%" right="50%">
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n  X\n\n");
});

// Ink coerces a STRING position offset to a PERCENT (styles.ts
// applyPositionStyles: `typeof value === 'string'` →
// setPositionPercent(edge, parseFloat(value))). So a bare-numeric string like
// top="50" is 50% of the container height, NOT 50 absolute cells. This mirrors
// the "absolute position with percentage offsets" test (top="50%" left="50%")
// but with bare-numeric strings. Without the fix vue forwards "50" raw to
// setPosition → 50 absolute cells → pushed off-screen.
test("absolute position with bare numeric string offsets is a percent (Ink parity)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6} height={4}>
        <Box position="absolute" top="50" left="50">
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\n   X\n");
});

test("relative position offsets visual position while keeping flow", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={5}>
        <Box position="relative" left={2}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(" BA");
});

test("static position ignores offsets", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={5}>
        <Box position="static" left={2}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AB");
});

test("static position ignores percentage offsets", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={5}>
        <Box position="static" left="50%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AB");
});

test("clears top offset on rerender", async () => {
  const top = shallowRef<number | undefined>(1);

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={5} height={3}>
        <Box position="absolute" top={top.value} left={2}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("\n  X\n");

  top.value = undefined;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("  X\n\n");
});

test("clears percentage top and left offsets on rerender", async () => {
  const top = shallowRef<string | undefined>("50%");
  const left = shallowRef<string | undefined>("50%");

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6} height={4}>
        <Box position="absolute" top={top.value} left={left.value}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("\n\n   X\n");

  top.value = undefined;
  left.value = undefined;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("X\n\n\n");
});

test("clears percentage top and left offsets when props are omitted on rerender", async () => {
  const showOffsets = shallowRef(true);

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6} height={4}>
        <Box
          position="absolute"
          {...(showOffsets.value ? { top: "50%" as const, left: "50%" as const } : {})}
        >
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("\n\n   X\n");

  showOffsets.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("X\n\n\n");
});

test("clears bottom and right offsets on rerender", async () => {
  const bottom = shallowRef<number | undefined>(1);
  const right = shallowRef<number | undefined>(1);

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6} height={4}>
        <Box position="absolute" bottom={bottom.value} right={right.value}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("\n\n    X\n");

  bottom.value = undefined;
  right.value = undefined;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("X\n\n\n");
});

// Skipped: absolute position with top and left offsets - concurrent
