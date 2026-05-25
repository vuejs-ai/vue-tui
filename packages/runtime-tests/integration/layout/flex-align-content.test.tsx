import { defineComponent, shallowRef, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

const alignContentCases = [
  ["flex-start", "AB\nCD\n\n\n\n"],
  ["center", "\n\nAB\nCD\n\n"],
  ["flex-end", "\n\n\n\nAB\nCD"],
  ["space-between", "AB\n\n\n\n\nCD"],
  ["space-around", "\nAB\n\n\nCD\n"],
  ["space-evenly", "\nAB\n\nCD\n\n"],
  ["stretch", "AB\n\n\nCD\n\n"],
] as const;

for (const [alignContent, expectedOutput] of alignContentCases) {
  test(`align content ${alignContent}`, async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box flexDirection="row" width={2} height={6} flexWrap="wrap" alignContent={alignContent}>
          <Text>A</Text>
          <Text>B</Text>
          <Text>C</Text>
          <Text>D</Text>
        </Box>
      )),
      { columns: 100 },
    );
    expect(lastFrame({ trimLines: true })).toBe(expectedOutput);
  });
}

test("align content defaults to flex-start", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={2} height={6} flexWrap="wrap">
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
        <Text>D</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AB\nCD\n\n\n\n");
});

test("align content does not add extra spacing when there is no free cross-axis space", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={2} height={2} flexWrap="wrap" alignContent="center">
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
        <Text>D</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AB\nCD");
});

test("clears alignContent on rerender to default flex-start", async () => {
  const alignContent = shallowRef<
    | "center"
    | "flex-start"
    | "flex-end"
    | "space-between"
    | "space-around"
    | "space-evenly"
    | "stretch"
    | undefined
  >("center");

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        flexDirection="row"
        width={2}
        height={6}
        flexWrap="wrap"
        alignContent={alignContent.value}
      >
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
        <Text>D</Text>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("\n\nAB\nCD\n\n");

  alignContent.value = undefined;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("AB\nCD\n\n\n\n");
});

test("clears alignContent from stretch on rerender to default flex-start", async () => {
  const alignContent = shallowRef<
    | "center"
    | "flex-start"
    | "flex-end"
    | "space-between"
    | "space-around"
    | "space-evenly"
    | "stretch"
    | undefined
  >("stretch");

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        flexDirection="row"
        width={2}
        height={6}
        flexWrap="wrap"
        alignContent={alignContent.value}
      >
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
        <Text>D</Text>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("AB\n\n\nCD\n\n");

  alignContent.value = undefined;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("AB\nCD\n\n\n\n");
});

test("clears alignContent when prop is omitted on rerender", async () => {
  const showAlignContent = shallowRef(true);

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        flexDirection="row"
        width={2}
        height={6}
        flexWrap="wrap"
        {...(showAlignContent.value ? { alignContent: "center" as const } : {})}
      >
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
        <Text>D</Text>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("\n\nAB\nCD\n\n");

  showAlignContent.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("AB\nCD\n\n\n\n");
});

// Skipped: align content center - concurrent
