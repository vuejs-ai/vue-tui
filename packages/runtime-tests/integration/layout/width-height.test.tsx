import { defineComponent, shallowRef, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("set width", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Box width={5}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A    B");
});

test("set width in percent", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={10}>
        <Box width="50%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A    B");
});

test("set min width", async () => {
  const { lastFrame: smallerFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Box minWidth={5}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(smallerFrame({ raw: true })).toBe("A    B");

  const { lastFrame: largerFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Box minWidth={2}>
          <Text>AAAAA</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(largerFrame()).toBe("AAAAAB");
});

test.skip("set min width in percent — known Yoga issue", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={10}>
        <Box minWidth="50%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A    B");
});

test("set height", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" height={4}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AB\n\n\n");
});

test("set height in percent", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={6} flexDirection="column">
        <Box height="50%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\nB\n\n");
});

test("cut text over the set height", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={2}>
        <Text>AAAABBBBCCCC</Text>
      </Box>
    )),
    { columns: 4 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AAAA\nBBBB");
});

test("set min height", async () => {
  const { lastFrame: smallerFrame } = await render(
    defineComponent(() => () => (
      <Box minHeight={4}>
        <Text>A</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(smallerFrame({ raw: true })).toBe("A\n\n\n");

  const { lastFrame: largerFrame } = await render(
    defineComponent(() => () => (
      <Box minHeight={2}>
        <Box height={4}>
          <Text>A</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(largerFrame({ raw: true })).toBe("A\n\n\n");
});

test("set min height in percent", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={6} flexDirection="column">
        <Box minHeight="50%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\nB\n\n");
});

test("set max width", async () => {
  const { lastFrame: constrainedFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Box maxWidth={3}>
          <Text>AAAAA</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 10 },
  );
  expect(constrainedFrame()).toBe("AAAB\nAA");

  const { lastFrame: unconstrainedFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Box maxWidth={10}>
          <Text>AAA</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(unconstrainedFrame()).toBe("AAAB");
});

test("clears maxWidth on rerender", async () => {
  const maxWidth = shallowRef<number | undefined>(3);

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Box maxWidth={maxWidth.value}>
          <Text>AAAAA</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 10 },
  );

  expect(lastFrame({ trimLines: true })).toBe("AAAB\nAA");

  maxWidth.value = undefined;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("AAAAAB");
});

test("set max height", async () => {
  const { lastFrame: constrainedFrame } = await render(
    defineComponent(() => () => (
      <Box maxHeight={2}>
        <Box height={4}>
          <Text>A</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(constrainedFrame({ raw: true })).toBe("A\n");

  const { lastFrame: unconstrainedFrame } = await render(
    defineComponent(() => () => (
      <Box maxHeight={4}>
        <Text>A</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(unconstrainedFrame()).toBe("A");
});

test("clears maxHeight on rerender", async () => {
  const maxHeight = shallowRef<number | undefined>(2);

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box maxHeight={maxHeight.value}>
        <Box height={4}>
          <Text>A</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("A\n");

  maxHeight.value = undefined;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\n");
});

test("set aspect ratio with width", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box width={8} aspectRatio={2} borderStyle="single">
          <Text>X</Text>
        </Box>
        <Text>Y</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("┌──────┐\n│X     │\n│      │\n└──────┘\nY");
});

test("set aspect ratio with height", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box height={3} aspectRatio={2} borderStyle="single">
          <Text>X</Text>
        </Box>
        <Text>Y</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("┌────┐\n│X   │\n└────┘\nY");
});

test("set aspect ratio with width and height", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box width={8} height={3} aspectRatio={2} borderStyle="single">
          <Text>X</Text>
        </Box>
        <Text>Y</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("┌────┐\n│X   │\n└────┘\nY");
});

test("set aspect ratio with maxHeight constraint", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box width={10} maxHeight={3} aspectRatio={2} borderStyle="single">
          <Text>X</Text>
        </Box>
        <Text>Y</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("┌────┐\n│X   │\n└────┘\nY");
});

test("clears aspectRatio on rerender", async () => {
  const aspectRatio = shallowRef<number | undefined>(2);

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box width={8} aspectRatio={aspectRatio.value} borderStyle="single">
          <Text>X</Text>
        </Box>
        <Text>Y</Text>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("┌──────┐\n│X     │\n│      │\n└──────┘\nY");

  aspectRatio.value = undefined;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("┌──────┐\n│X     │\n└──────┘\nY");
});

// Ink parity G12: Ink's getWindowSize() uses a truthy guard (if (columns && rows))
// so that a 0 value from stdout in non-TTY environments falls back to terminal-size
// and then 80/24 defaults. vue-tui's renderer was using `stdout.columns ?? 80`
// which only falls back for null/undefined — not 0 — collapsing layout to width 0.
// References: Ink /tmp/ink-40b3a75/src/utils.ts lines 8-23.
test("falls back to default width when stdout reports 0 columns (Ink parity G12)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width="100%">
        <Text>hello</Text>
      </Box>
    )),
    // columns: 0 — simulates non-TTY where stdout.columns is 0 (not null/undefined).
    // With the bug: width resolves to 0, yoga collapses to 0-width, "hello" disappears.
    // With the fix: resolveSize() truthy-guards 0, falls back to terminal-size / 80.
    { columns: 0, rows: 0 },
  );
  expect(lastFrame()).toContain("hello");
});

test.skip("set max width in percent — known Yoga issue", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={10}>
        <Box maxWidth="50%">
          <Text>AAAAAAAAAA</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AAAAAB");
});

test("set max height in percent", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={6} flexDirection="column">
        <Box maxHeight="50%">
          <Box height={6}>
            <Text>A</Text>
          </Box>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\nB\n\n");
});

// Skipped: set width - concurrent
// Skipped: set height - concurrent
