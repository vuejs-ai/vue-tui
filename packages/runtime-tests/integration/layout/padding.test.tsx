import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("padding", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box padding={2}>
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\n  X\n\n");
});

test("padding X", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Box paddingX={2}>
          <Text>X</Text>
        </Box>
        <Text>Y</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("  X  Y");
});

test("padding Y", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingY={2}>
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\nX\n\n");
});

test("padding top", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingTop={2}>
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\nX");
});

test("padding bottom", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingBottom={2}>
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("X\n\n");
});

test("padding left", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingLeft={2}>
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("  X");
});

test("padding right", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Box paddingRight={2}>
          <Text>X</Text>
        </Box>
        <Text>Y</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("X  Y");
});

test("nested padding", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box padding={2}>
        <Box padding={2}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\n\n\n    X\n\n\n\n");
});

test("padding with multiline string", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box padding={2}>
        <Text>{"A\nB"}</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\n  A\n  B\n\n");
});

test("apply padding to text with newlines", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box padding={1}>
        <Text>Hello{"\n"}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n Hello\n World\n");
});

test("apply padding to wrapped text", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box padding={1} width={5}>
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n Hel\n lo\n Wor\n ld\n");
});

test("text wrapping respects paddingX with flexGrow", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={40} borderStyle="round">
        <Box paddingX={2}>
          <Box marginLeft={2}>
            <Text>•</Text>
            <Box flexGrow={1} marginLeft={1}>
              <Text>Lorem ipsum dolor sit amet, consectetur adipiscing elit</Text>
            </Box>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame({ trimLines: true }) ?? "";
  const lines = output.split("\n");
  for (const line of lines) {
    expect(line.length).toBeLessThanOrEqual(40);
  }
});

// Skipped: padding - concurrent
// Skipped: nested padding - concurrent
