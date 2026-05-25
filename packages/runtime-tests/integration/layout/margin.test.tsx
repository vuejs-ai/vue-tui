import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("margin", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box margin={2}>
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\n  X\n\n");
});

test("margin X", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Box marginX={2}>
          <Text>X</Text>
        </Box>
        <Text>Y</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("  X  Y");
});

test("margin Y", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box marginY={2}>
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\nX\n\n");
});

test("margin top", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box marginTop={2}>
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\nX");
});

test("margin bottom", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box marginBottom={2}>
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("X\n\n");
});

test("margin left", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box marginLeft={2}>
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("  X");
});

test("margin right", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Box marginRight={2}>
          <Text>X</Text>
        </Box>
        <Text>Y</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("X  Y");
});

test("nested margin", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box margin={2}>
        <Box margin={2}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\n\n\n    X\n\n\n\n");
});

test("margin with multiline string", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box margin={2}>
        <Text>{"A\nB"}</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\n  A\n  B\n\n");
});

test("apply margin to text with newlines", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box margin={1}>
        <Text>Hello{"\n"}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n Hello\n World\n");
});

test("apply margin to wrapped text", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box margin={1} width={6}>
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n Hello\n World\n");
});

// Skipped: margin - concurrent
// Skipped: nested margin - concurrent
