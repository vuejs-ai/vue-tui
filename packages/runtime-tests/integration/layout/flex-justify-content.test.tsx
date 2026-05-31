import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";
import chalk from "chalk";

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

test("row - align text to right", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" justifyContent="flex-end" width={10}>
        <Text>Test</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("      Test");
});

test("row - align multiple text nodes to right", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" justifyContent="flex-end" width={10}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("        AB");
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

test("row - space evenly two text nodes", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" justifyContent="space-evenly" width={10}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("  A   B");
});

// Yoga has a bug where the first child in a space-around container gets the wrong
// X coordinate (its measure func runs on a mis-placed node). Mirrors Ink's
// test.failing for the same input: we assert the DESIRED output " A B" and mark
// the test `fails`, so it RUNS and passes only WHILE the shared yoga bug persists.
// If yoga ever fixes this, the test flips to passing-unexpectedly and fails the
// run — flagging that this comment (and Ink's matching divergence note) is stale.
test.fails("row - align two text nodes with equal space around them — known Yoga issue", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" justifyContent="space-around" width={5}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(" A B");
});

test("row - align colored text node when text is squashed", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" justifyContent="flex-end" width={5}>
        <Text color="green">X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(`    ${chalk.green("X")}`);
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

test("column - align text to bottom", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" justifyContent="flex-end" height={3}>
        <Text>Test</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\nTest");
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

// Same yoga space-around first-child bug on the column axis. test.fails asserts
// the DESIRED "\nA\n\nB\n" and passes only while the bug persists (see the row
// case above for the rationale). Mirrors Ink's test.failing.
test.fails("column - align two text nodes with equal space around them — known Yoga issue", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" justifyContent="space-around" height={5}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\nA\n\nB\n");
});
