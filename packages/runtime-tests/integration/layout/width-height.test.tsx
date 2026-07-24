import { defineComponent } from "vue";
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

test("decimal percentage width keeps the complete value", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={99}>
        <Box width="55.9%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );

  // 55.9% of 99 reaches cell 55; truncating the percentage to 55 first reaches cell 54.
  expect(lastFrame()!.indexOf("B")).toBe(55);
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

// A deterministic test host must describe a finite valid environment rather
// than silently manufacture one from an impossible dimension.
test("deterministic host rejects zero dimensions before rendering", async () => {
  await expect(
    render(
      defineComponent(() => () => (
        <Box width="100%">
          <Text>hello</Text>
        </Box>
      )),
      { columns: 0, rows: 0 },
    ),
  ).rejects.toThrow("render columns must be a positive safe integer");
});
