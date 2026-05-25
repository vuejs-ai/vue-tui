import { defineComponent, shallowRef, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

const BG_BLUE = "\x1b[44m";

test("Box backgroundColor produces ANSI background codes", async () => {
  const { frames } = await render(() => <Box backgroundColor="blue" width={5} height={1} />, {
    columns: 10,
  });
  expect(frames.at(-1)).toContain(BG_BLUE);
});

test("Box backgroundColor survives border rendering", async () => {
  const { frames } = await render(
    () => <Box backgroundColor="blue" borderStyle="single" width={6} height={3} />,
    { columns: 10 },
  );
  const raw = frames.at(-1)!;
  expect(raw).toContain(BG_BLUE);
  expect(raw).toContain("┌");
});

test("child Text inherits backgroundColor from parent Box", async () => {
  const { frames } = await render(
    () => (
      <Box backgroundColor="blue" width={10} height={1}>
        <Text>hello</Text>
      </Box>
    ),
    { columns: 20 },
  );
  const raw = frames.at(-1)!;
  expect(raw).toContain("hello");
  expect(raw).toContain(BG_BLUE);
});

test("wrapped text preserves backgroundColor on every line", async () => {
  const { frames } = await render(
    () => (
      <Box backgroundColor="blue" borderStyle="single" width={10} height={4}>
        <Text>long text here</Text>
      </Box>
    ),
    { columns: 20 },
  );
  const raw = frames.at(-1)!;
  const lines = raw.split("\n").filter(Boolean);
  for (const line of lines) {
    expect(line).toContain(BG_BLUE);
  }
});

// --- Ink background tests ---

test("Text inherits parent Box background color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="green" alignSelf="flex-start">
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[42m[42mHello World[49m[42m[49m"`);
});

test("Text explicit background color overrides inherited", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" alignSelf="flex-start">
        <Text backgroundColor="blue">Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[41m[44mHello World[49m[41m[49m"`);
});

test("Nested Box background inheritance", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" alignSelf="flex-start">
        <Box backgroundColor="blue">
          <Text>Hello World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[44m[44mHello World[49m[44m[49m"`);
});

test("Text without parent Box background has no inheritance", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box alignSelf="flex-start">
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello World");
});

test("Multiple Text elements inherit same background", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="yellow" alignSelf="flex-start">
        <Text>Hello </Text>
        <Text>World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[43m[43mHello [49m[43m[49m
    [43m[43mWorld[49m[43m [49m"
  `);
});

test("Mixed text with and without background inheritance", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="green" alignSelf="flex-start">
        <Text>Inherited </Text>
        <Text backgroundColor="">No BG </Text>
        <Text backgroundColor="red">Red BG</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[42m[42mInherited [49m[42m[49m
    [42mNo BG     [49m
    [42m[41mRed BG[49m[42m    [49m"
  `);
});

test("Complex nested structure with background inheritance", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="yellow" alignSelf="flex-start">
        <Box>
          <Text>Outer: </Text>
          <Box backgroundColor="blue">
            <Text>Inner: </Text>
            <Text backgroundColor="red">Explicit</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[43m[43mOuter: [49m[43m [49m
    [44m[44mInner: [49m[44m [49m
    [44m[41mExplicit[49m[44m[49m"
  `);
});

test("Box background with standard color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[41m[41mHello[49m[41m[49m"`);
});

test("Box background with hex color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="#FF0000" alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(
    `"[48;2;255;0;0m[48;2;255;0;0mHello[49m[48;2;255;0;0m[49m"`,
  );
});

test("Box background with rgb color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="rgb(255, 0, 0)" alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(
    `"[48;2;255;0;0m[48;2;255;0;0mHello[49m[48;2;255;0;0m[49m"`,
  );
});

test("Box background with ansi256 color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="ansi256(9)" alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[48;5;9m[48;5;9mHello[49m[48;5;9m[49m"`);
});

test("Box background with wide characters", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="yellow" alignSelf="flex-start">
        <Text>こんにちは</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[43m[43mこんにちは[49m[43m[49m"`);
});

test("Box background with emojis", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" alignSelf="flex-start">
        <Text>🎉🎊</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[41m[41m🎉🎊[49m[41m[49m"`);
});

test("Box background fills entire area with standard color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" width={10} height={3} alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[41m[41mHello[49m[41m     [49m
    [41m          [49m
    [41m          [49m"
  `);
});

test("Box background fills with hex color", async () => {
  const bgHexRed = "[48;2;255;0;0m";
  const bgReset = "[49m";

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="#FF0000" width={10} height={3} alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  expect(output).toContain("Hello");
  expect(output).toContain(bgHexRed);
  expect(output).toContain(bgReset);
});

test("Box background fills with rgb color", async () => {
  const bgHexRed = "[48;2;255;0;0m";
  const bgReset = "[49m";

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="rgb(255, 0, 0)" width={10} height={3} alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  expect(output).toContain("Hello");
  expect(output).toContain(bgHexRed);
  expect(output).toContain(bgReset);
});

test("Box background fills with ansi256 color", async () => {
  const bgAnsi256Nine = "[48;5;9m";
  const bgReset = "[49m";

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="ansi256(9)" width={10} height={3} alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  expect(output).toContain("Hello");
  expect(output).toContain(bgAnsi256Nine);
  expect(output).toContain(bgReset);
});

test("Box background with border fills content area", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="cyan" borderStyle="round" width={10} height={5} alignSelf="flex-start">
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[46m╭────────╮[49m
    [46m│[49m[46m[46mHi[49m[46m      [49m[46m│[49m
    [46m│[49m[46m        [49m[46m│[49m
    [46m│[49m[46m        [49m[46m│[49m
    [46m╰────────╯[49m"
  `);
});

test("Box background with padding fills entire padded area", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="magenta" padding={1} width={10} height={5} alignSelf="flex-start">
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[45m          [49m
    [45m [45m[45mHi[49m[45m      [49m [49m
    [45m          [49m
    [45m          [49m
    [45m          [49m"
  `);
});

test("Box background with center alignment fills entire area", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        backgroundColor="blue"
        width={10}
        height={3}
        justifyContent="center"
        alignSelf="flex-start"
      >
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[44m          [49m
    [44m[44mHi[49m[44m        [49m
    [44m          [49m"
  `);
});

test("Box background with column layout fills entire area", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        backgroundColor="green"
        flexDirection="column"
        width={10}
        height={5}
        alignSelf="flex-start"
      >
        <Text>Line 1</Text>
        <Text>Line 2</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[42m[42mLine 1[49m[42m    [49m
    [42m[42mLine 2[49m[42m    [49m
    [42m          [49m
    [42m          [49m
    [42m          [49m"
  `);
});

test("Box background updates on rerender", async () => {
  const bgColor = shallowRef<string | undefined>(undefined);

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor={bgColor.value} alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame()).toBe("Hello");

  bgColor.value = "green";
  await nextTick();
  expect(lastFrame()).toMatchInlineSnapshot(`"[42m[42mHello[49m[42m[49m"`);

  bgColor.value = undefined;
  await nextTick();
  expect(lastFrame()).toBe("Hello");
});

test("Box backgroundColor fills full width on every line when text wraps", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" width={10} alignSelf="flex-start">
        <Text>Hello World!!</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[41m[41mHello [49m[41m    [49m
    [41m[41mWorld!![49m[41m   [49m"
  `);
});

test("Text-only backgroundColor colors text content but does not fill Box width", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={10} alignSelf="flex-start">
        <Text backgroundColor="red">Hello World!!</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[41mHello [49m
    [41mWorld!![49m"
  `);
});

// --- Ink border-backgrounds tests ---

test("border with background color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="single" borderColor="white" borderBackgroundColor="blue">
        <Box width={4}>
          <Text>Test</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  expect(output).toContain("┌");
  expect(output).toContain("┐");
  expect(output).toContain("└");
  expect(output).toContain("┘");
  expect(output).toContain("Test");
  // Named blue background => ESC[44m
  expect(output).toContain("[44m");
});

test("border with different background colors per side", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        borderStyle="single"
        borderTopBackgroundColor="red"
        borderBottomBackgroundColor="blue"
        borderLeftBackgroundColor="green"
        borderRightBackgroundColor="yellow"
      >
        <Box width={4}>
          <Text>Test</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  expect(output).toContain("┌");
  expect(output).toContain("┐");
  expect(output).toContain("└");
  expect(output).toContain("┘");
  expect(output).toContain("Test");
  // red => 41, green => 42, yellow => 43, blue => 44
  expect(output).toContain("[41m");
  expect(output).toContain("[42m");
  expect(output).toContain("[43m");
  expect(output).toContain("[44m");
});

test("border background color fallback to general borderBackgroundColor", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="single" borderBackgroundColor="magenta" borderTopBackgroundColor="cyan">
        <Box width={4}>
          <Text>Test</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  expect(output).toContain("┌");
  expect(output).toContain("┐");
  expect(output).toContain("└");
  expect(output).toContain("┘");
  expect(output).toContain("Test");
  // cyan => 46, magenta => 45
  expect(output).toContain("[46m");
  expect(output).toContain("[45m");
});

test("vertical border background does not bleed into content rows", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="classic" borderBackgroundColor="cyan" alignSelf="flex-start" width={12}>
        <Text>Text longer than the Box width, so will definitely wrap.</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  const bgCyanPattern = "\\[46m";
  const bgResetPattern = "\\[49m";
  const tableBorderChar = "|";
  const tableBorderPattern = bgCyanPattern + tableBorderChar + bgResetPattern;
  const contentRowPattern = new RegExp(`^${tableBorderPattern}.*${tableBorderPattern}$`);

  const tableRows = output.split("\n");
  const contentRows = tableRows.slice(1, -1);
  for (const contentRow of contentRows) {
    expect(contentRow).toMatch(contentRowPattern);
  }
});

test("foreground, background and dim combine correctly", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        borderTopDimColor
        borderStyle="single"
        borderTopColor="red"
        borderTopBackgroundColor="cyan"
        alignSelf="flex-start"
      >
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  // red FG (31), cyan BG (46), dim (2)
  expect(output).toContain("[31m");
  expect(output).toContain("[46m");
  expect(output).toContain("[2m");
});
