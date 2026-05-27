import { defineComponent, shallowRef, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, measureText } from "@vue-tui/runtime";
import stripAnsi from "strip-ansi";

// single node — full width box
test("single node - full width box", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round">
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭──────────────────────────────────────────────────────────────────────────────────────────────────╮
    │Hello World                                                                                       │
    ╰──────────────────────────────────────────────────────────────────────────────────────────────────╯"
  `);
});

// single node — full width box with colorful border
test("single node - full width box with colorful border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" borderColor="green">
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[32m╭──────────────────────────────────────────────────────────────────────────────────────────────────╮[39m
    [32m│[39mHello World                                                                                       [32m│[39m
    [32m╰──────────────────────────────────────────────────────────────────────────────────────────────────╯[39m"
  `);
});

// single node — fit-content box
test("single node - fit-content box", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" alignSelf="flex-start">
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭───────────╮
    │Hello World│
    ╰───────────╯"
  `);
});

// single node — fit-content box with wide characters
test("single node - fit-content box with wide characters", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" alignSelf="flex-start">
        <Text>こんにちは</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭──────────╮
    │こんにちは│
    ╰──────────╯"
  `);
});

// single node — fit-content box with emojis
test("single node - fit-content box with emojis", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" alignSelf="flex-start">
        <Text>🌊🌊</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭────╮
    │🌊🌊│
    ╰────╯"
  `);
});

// single node — fit-content box with variation selector emojis
test("single node - fit-content box with variation selector emojis", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" alignSelf="flex-start">
        <Text>🌡️⚠️✅</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭──────╮
    │🌡️⚠️✅│
    ╰──────╯"
  `);
});

// single node — fixed width box
test("single node - fixed width box", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" width={20}>
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭──────────────────╮
    │Hello World       │
    ╰──────────────────╯"
  `);
});

// single node — fixed width and height box
test("single node - fixed width and height box", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" width={20} height={20}>
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭──────────────────╮
    │Hello World       │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    ╰──────────────────╯"
  `);
});

// single node — box with padding
test("single node - box with padding", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" padding={1} alignSelf="flex-start">
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭─────────────╮
    │             │
    │ Hello World │
    │             │
    ╰─────────────╯"
  `);
});

// single node — box with horizontal alignment
test("single node - box with horizontal alignment", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" width={20} justifyContent="center">
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭──────────────────╮
    │   Hello World    │
    ╰──────────────────╯"
  `);
});

// single node — box with vertical alignment
test("single node - box with vertical alignment", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" height={20} alignItems="center" alignSelf="flex-start">
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭───────────╮
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    │Hello World│
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    ╰───────────╯"
  `);
});

// single node — box with wrapping
test("single node - box with wrapping", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" width={10}>
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭────────╮
    │Hello   │
    │World   │
    ╰────────╯"
  `);
});

// multiple nodes — full width box
test("multiple nodes - full width box", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round">
        <Text>{"Hello "}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭──────────────────────────────────────────────────────────────────────────────────────────────────╮
    │Hello World                                                                                       │
    ╰──────────────────────────────────────────────────────────────────────────────────────────────────╯"
  `);
});

// multiple nodes — full width box with colorful border
test("multiple nodes - full width box with colorful border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" borderColor="green">
        <Text>{"Hello "}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[32m╭──────────────────────────────────────────────────────────────────────────────────────────────────╮[39m
    [32m│[39mHello World                                                                                       [32m│[39m
    [32m╰──────────────────────────────────────────────────────────────────────────────────────────────────╯[39m"
  `);
});

// multiple nodes — fit-content box
test("multiple nodes - fit-content box", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" alignSelf="flex-start">
        <Text>{"Hello "}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭───────────╮
    │Hello World│
    ╰───────────╯"
  `);
});

// multiple nodes — fixed width box
test("multiple nodes - fixed width box", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" width={20}>
        <Text>{"Hello "}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭──────────────────╮
    │Hello World       │
    ╰──────────────────╯"
  `);
});

// multiple nodes — fixed width and height box
test("multiple nodes - fixed width and height box", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" width={20} height={20}>
        <Text>{"Hello "}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭──────────────────╮
    │Hello World       │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    │                  │
    ╰──────────────────╯"
  `);
});

// multiple nodes — box with padding
test("multiple nodes - box with padding", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" padding={1} alignSelf="flex-start">
        <Text>{"Hello "}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭─────────────╮
    │             │
    │ Hello World │
    │             │
    ╰─────────────╯"
  `);
});

// multiple nodes — box with horizontal alignment
test("multiple nodes - box with horizontal alignment", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" width={20} justifyContent="center">
        <Text>{"Hello "}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭──────────────────╮
    │   Hello World    │
    ╰──────────────────╯"
  `);
});

// multiple nodes — box with vertical alignment
test("multiple nodes - box with vertical alignment", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" height={20} alignItems="center" alignSelf="flex-start">
        <Text>{"Hello "}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭───────────╮
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    │Hello World│
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    │           │
    ╰───────────╯"
  `);
});

// multiple nodes — box with wrapping
test("multiple nodes - box with wrapping", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" width={10}>
        <Text>{"Hello "}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭────────╮
    │Hello   │
    │World   │
    ╰────────╯"
  `);
});

// multiple nodes — box with wrapping and long first node
test("multiple nodes - box with wrapping and long first node", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" width={10}>
        <Text>{"Helloooooo"} World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭────────╮
    │Helloooo│
    │oo World│
    ╰────────╯"
  `);
});

// multiple nodes — box with wrapping and very long first node
test("multiple nodes - box with wrapping and very long first node", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" width={10}>
        <Text>{"Hellooooooooooooo"} World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭────────╮
    │Helloooo│
    │oooooooo│
    │o World │
    ╰────────╯"
  `);
});

// nested boxes
test("nested boxes", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" width={40} padding={1}>
        <Box borderStyle="round" justifyContent="center" padding={1}>
          <Text>Hello World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭──────────────────────────────────────╮
    │                                      │
    │ ╭─────────────╮                      │
    │ │             │                      │
    │ │ Hello World │                      │
    │ │             │                      │
    │ ╰─────────────╯                      │
    │                                      │
    ╰──────────────────────────────────────╯"
  `);
});

// nested boxes — fit-content box with wide characters on flex-direction row
test("nested boxes - fit-content box with wide characters on flex-direction row", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" alignSelf="flex-start">
        <Box borderStyle="round">
          <Text>ミスター</Text>
        </Box>
        <Box borderStyle="round">
          <Text>スポック</Text>
        </Box>
        <Box borderStyle="round">
          <Text>カーク船長</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭────────────────────────────────╮
    │╭────────╮╭────────╮╭──────────╮│
    ││ミスター││スポック││カーク船長││
    │╰────────╯╰────────╯╰──────────╯│
    ╰────────────────────────────────╯"
  `);
});

// nested boxes — fit-content box with emojis on flex-direction row
test("nested boxes - fit-content box with emojis on flex-direction row", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" alignSelf="flex-start">
        <Box borderStyle="round">
          <Text>🦾</Text>
        </Box>
        <Box borderStyle="round">
          <Text>🌏</Text>
        </Box>
        <Box borderStyle="round">
          <Text>😋</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭────────────╮
    │╭──╮╭──╮╭──╮│
    ││🦾││🌏││😋││
    │╰──╯╰──╯╰──╯│
    ╰────────────╯"
  `);
});

// nested boxes — fit-content box with wide characters on flex-direction column
test("nested boxes - fit-content box with wide characters on flex-direction column", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" alignSelf="flex-start" flexDirection="column">
        <Box borderStyle="round">
          <Text>ミスター</Text>
        </Box>
        <Box borderStyle="round">
          <Text>スポック</Text>
        </Box>
        <Box borderStyle="round">
          <Text>カーク船長</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭────────────╮
    │╭──────────╮│
    ││ミスター  ││
    │╰──────────╯│
    │╭──────────╮│
    ││スポック  ││
    │╰──────────╯│
    │╭──────────╮│
    ││カーク船長││
    │╰──────────╯│
    ╰────────────╯"
  `);
});

// nested boxes — fit-content box with emojis on flex-direction column
test("nested boxes - fit-content box with emojis on flex-direction column", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" alignSelf="flex-start" flexDirection="column">
        <Box borderStyle="round">
          <Text>🦾</Text>
        </Box>
        <Box borderStyle="round">
          <Text>🌏</Text>
        </Box>
        <Box borderStyle="round">
          <Text>😋</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭────╮
    │╭──╮│
    ││🦾││
    │╰──╯│
    │╭──╮│
    ││🌏││
    │╰──╯│
    │╭──╮│
    ││😋││
    │╰──╯│
    ╰────╯"
  `);
});

// render border after update — reactive borderColor changes
test("render border after update", async () => {
  const borderColor = shallowRef<string | undefined>(undefined);
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" borderColor={borderColor.value}>
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭──────────────────────────────────────────────────────────────────────────────────────────────────╮
    │Hello World                                                                                       │
    ╰──────────────────────────────────────────────────────────────────────────────────────────────────╯"
  `);

  borderColor.value = "green";
  await nextTick();
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[32m╭──────────────────────────────────────────────────────────────────────────────────────────────────╮[39m
    [32m│[39mHello World                                                                                       [32m│[39m
    [32m╰──────────────────────────────────────────────────────────────────────────────────────────────────╯[39m"
  `);

  borderColor.value = undefined;
  await nextTick();
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭──────────────────────────────────────────────────────────────────────────────────────────────────╮
    │Hello World                                                                                       │
    ╰──────────────────────────────────────────────────────────────────────────────────────────────────╯"
  `);
});

// render border edge changes after update when borderStyle is unchanged
test("render border edge changes after update when borderStyle is unchanged", async () => {
  const showTop = shallowRef(true);
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" borderTop={showTop.value} alignSelf="flex-start">
        <Text>Content</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭───────╮
    │Content│
    ╰───────╯"
  `);

  showTop.value = false;
  await nextTick();
  expect(lastFrame()).toMatchInlineSnapshot(`
    " Content
    ╰───────╯"
  `);

  showTop.value = true;
  await nextTick();
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭───────╮
    │Content│
    ╰───────╯"
  `);
});

// hide top border
test("hide top border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderStyle="round" borderTop={false}>
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
     Content
    ╰───────╯
    Below"
  `);
});

// hide bottom border
test("hide bottom border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderStyle="round" borderBottom={false}>
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    ╭───────╮
     Content
    Below"
  `);
});

// hide top and bottom borders
test("hide top and bottom borders", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderStyle="round" borderTop={false} borderBottom={false}>
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
     Content
    Below"
  `);
});

// hide left border
test("hide left border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderStyle="round" borderLeft={false}>
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    ───────╮
    Content│
    ───────╯
    Below"
  `);
});

// hide right border
test("hide right border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderStyle="round" borderRight={false}>
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    ╭───────
    │Content
    ╰───────
    Below"
  `);
});

// hide left and right border
test("hide left and right border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderStyle="round" borderLeft={false} borderRight={false}>
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    ───────
    Content
    ───────
    Below"
  `);
});

// hide all borders
test("hide all borders", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box
          borderStyle="round"
          borderTop={false}
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
        >
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    Content
    Below"
  `);
});

// change color of top border
test("change color of top border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderStyle="round" borderTopColor="green">
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    [32m╭───────╮[39m
    │Content│
    ╰───────╯
    Below"
  `);
});

// change color of bottom border
test("change color of bottom border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderStyle="round" borderBottomColor="green">
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    ╭───────╮
    │Content│
    [32m╰───────╯[39m
    Below"
  `);
});

// change color of left border
test("change color of left border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderStyle="round" borderLeftColor="green">
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    ╭───────╮
    [32m│[39mContent│
    ╰───────╯
    Below"
  `);
});

// change color of right border
test("change color of right border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderStyle="round" borderRightColor="green">
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    ╭───────╮
    │Content[32m│[39m
    ╰───────╯
    Below"
  `);
});

// custom border style — uses "arrow" named style (same chars as the Ink custom object)
test("custom border style", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="arrow">
        <Text>Content</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "↘↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↙
    →Content                                                                                           ←
    ↗↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↖"
  `);
});

// arrow border on narrow box does not overflow
test("arrow border on narrow box does not overflow", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="arrow" width={3} height={3}>
        <Text>x</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const frame = lastFrame()!;
  for (const line of frame.split("\n")) {
    expect(measureText(stripAnsi(line), 9999).width).toBeLessThanOrEqual(3);
  }
  const stripped = stripAnsi(frame);
  expect(stripped.split("\n")[0]).toContain("↘");
  expect(stripped.split("\n")[2]).toContain("↗");
});

// dim border color
test("dim border color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderDimColor borderStyle="round">
        <Text>Content</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[2m╭──────────────────────────────────────────────────────────────────────────────────────────────────╮[22m
    [2m│[22mContent                                                                                           [2m│[22m
    [2m╰──────────────────────────────────────────────────────────────────────────────────────────────────╯[22m"
  `);
});

// dim top border color
test("dim top border color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderTopDimColor borderStyle="round">
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    [2m╭───────╮[22m
    │Content│
    ╰───────╯
    Below"
  `);
});

// dim bottom border color
test("dim bottom border color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderBottomDimColor borderStyle="round">
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    ╭───────╮
    │Content│
    [2m╰───────╯[22m
    Below"
  `);
});

// dim left border color
test("dim left border color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderLeftDimColor borderStyle="round">
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    ╭───────╮
    [2m│[22mContent│
    ╰───────╯
    Below"
  `);
});

// dim right border color
test("dim right border color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignItems="flex-start">
        <Text>Above</Text>
        <Box borderRightDimColor borderStyle="round">
          <Text>Content</Text>
        </Box>
        <Text>Below</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    ╭───────╮
    │Content[2m│[22m
    ╰───────╯
    Below"
  `);
});

// borderDimColor should not dim styled child Text touching left edge
test("borderDimColor does not dim styled child Text touching left edge", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderDimColor borderStyle="round" alignSelf="flex-start">
        <Text bold color="blue">
          styled text
        </Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[2m╭───────────╮[22m
    [2m│[22m[34m[1mstyled text[22m[39m[2m│[22m
    [2m╰───────────╯[22m"
  `);
});
