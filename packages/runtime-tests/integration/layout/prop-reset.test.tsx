import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("reset height to auto on removal", async () => {
  const withHeight = shallowRef(true);
  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column" height={withHeight.value ? 4 : undefined}>
      <Text>x</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ raw: true })).toBe("x\n\n\n");

  withHeight.value = false;
  await nextTick();
  expect(lastFrame({ raw: true })).toBe("x");
});

test("reset marginTop to 0 on removal", async () => {
  const withMargin = shallowRef(true);
  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column" {...(withMargin.value ? { marginTop: 4 } : {})}>
      <Text>x</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("\n\n\n\nx");

  withMargin.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("x");
});

test("reset paddingTop to 0 on removal", async () => {
  const withPadding = shallowRef(true);
  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column" {...(withPadding.value ? { paddingTop: 3 } : {})}>
      <Text>x</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("\n\n\nx");

  withPadding.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("x");
});

test("reset minWidth on removal", async () => {
  const withMinimum = shallowRef(true);
  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="row">
      <Box {...(withMinimum.value ? { minWidth: 10 } : {})}>
        <Text>x</Text>
      </Box>
      <Text>y</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("x         y");

  withMinimum.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("xy");
});

test("reset minHeight on removal", async () => {
  const withMinimum = shallowRef(true);
  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column" {...(withMinimum.value ? { minHeight: 4 } : {})}>
      <Text>x</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ raw: true })).toBe("x\n\n\n");

  withMinimum.value = false;
  await nextTick();
  expect(lastFrame({ raw: true })).toBe("x");
});

test("reset gap to 0 on removal", async () => {
  const withGap = shallowRef(true);
  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column" {...(withGap.value ? { gap: 2 } : {})}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\nB");

  withGap.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("A\nB");
});

test("reset flexGrow to 0 on removal", async () => {
  const withGrow = shallowRef(true);
  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="row" width={6}>
      <Box {...(withGrow.value ? { flexGrow: 1 } : {})}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("A    B");

  withGrow.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("AB");
});

test("reset flexBasis to auto on removal", async () => {
  const withBasis = shallowRef(true);
  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="row" width={6}>
      <Box {...(withBasis.value ? { flexBasis: 3 } : {})}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("A  B");

  withBasis.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("AB");
});

test("reset justifyContent to flex-start on removal", async () => {
  const withJustification = shallowRef(true);
  const Dynamic = defineComponent(() => () => (
    <Box
      flexDirection="row"
      width={5}
      {...(withJustification.value ? { justifyContent: "center" } : {})}
    >
      <Text>x</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("  x");

  withJustification.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("x");
});

test("reset display=none to visible default on removal", async () => {
  const hidden = shallowRef(true);
  const Dynamic = defineComponent(() => () => (
    <Box {...(hidden.value ? { display: "none" } : {})}>
      <Text>X</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("");

  hidden.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("X");
});

test("explicit display=none hides while set", async () => {
  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column">
      <Box display="none">
        <Text>hidden</Text>
      </Box>
      <Text>shown</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("shown");
});

test("reset absolute positioning to normal flow on removal", async () => {
  const absolute = shallowRef(true);
  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column" width={4} height={3}>
      <Box {...(absolute.value ? { position: "absolute", top: 2 } : {})}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("B\n\nA");

  absolute.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("A\nB\n");
});

test("reset flexDirection to row on removal", async () => {
  const column = shallowRef(true);
  const Dynamic = defineComponent(() => () => (
    <Box {...(column.value ? { flexDirection: "column" } : {})}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("A\nB");

  column.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("AB");
});
