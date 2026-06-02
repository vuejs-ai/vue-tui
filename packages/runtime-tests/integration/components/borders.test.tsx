import { defineComponent, shallowRef, nextTick } from "vue";
import { test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";
import stripAnsi from "strip-ansi";
import stringWidth from "string-width";

// single node — full width box
test("single node - full width box", async ({ expect }) => {
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
test("single node - full width box with colorful border", async ({ expect }) => {
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
test("single node - fit-content box", async ({ expect }) => {
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
test("single node - fit-content box with wide characters", async ({ expect }) => {
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
test("single node - fit-content box with emojis", async ({ expect }) => {
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
test("single node - fit-content box with variation selector emojis", async ({ expect }) => {
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
test("single node - fixed width box", async ({ expect }) => {
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
test("single node - fixed width and height box", async ({ expect }) => {
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
test("single node - box with padding", async ({ expect }) => {
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
test("single node - box with horizontal alignment", async ({ expect }) => {
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
test("single node - box with vertical alignment", async ({ expect }) => {
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
test("single node - box with wrapping", async ({ expect }) => {
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
test("multiple nodes - full width box", async ({ expect }) => {
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
test("multiple nodes - full width box with colorful border", async ({ expect }) => {
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
test("multiple nodes - fit-content box", async ({ expect }) => {
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
test("multiple nodes - fixed width box", async ({ expect }) => {
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
test("multiple nodes - fixed width and height box", async ({ expect }) => {
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
test("multiple nodes - box with padding", async ({ expect }) => {
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
test("multiple nodes - box with horizontal alignment", async ({ expect }) => {
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
test("multiple nodes - box with vertical alignment", async ({ expect }) => {
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
test("multiple nodes - box with wrapping", async ({ expect }) => {
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
test("multiple nodes - box with wrapping and long first node", async ({ expect }) => {
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
test("multiple nodes - box with wrapping and very long first node", async ({ expect }) => {
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
test("nested boxes", async ({ expect }) => {
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
test("nested boxes - fit-content box with wide characters on flex-direction row", async ({
  expect,
}) => {
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
test("nested boxes - fit-content box with emojis on flex-direction row", async ({ expect }) => {
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
test("nested boxes - fit-content box with wide characters on flex-direction column", async ({
  expect,
}) => {
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
test("nested boxes - fit-content box with emojis on flex-direction column", async ({ expect }) => {
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
test("render border after update", async ({ expect }) => {
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
test("render border edge changes after update when borderStyle is unchanged", async ({
  expect,
}) => {
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
  // G15 fix: with borderTop=false, side rails now start at row 0 (Ink parity)
  expect(lastFrame()).toMatchInlineSnapshot(`
    "│Content│
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
test("hide top border", async ({ expect }) => {
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
  // G15 fix: side rails now start at row 0 when borderTop=false (Ink parity)
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    │Content│
    ╰───────╯
    Below"
  `);
});

// hide bottom border
test("hide bottom border", async ({ expect }) => {
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
  // G15 fix: side rails now span the full content height when borderBottom=false (Ink parity)
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    ╭───────╮
    │Content│
    Below"
  `);
});

// hide top and bottom borders
test("hide top and bottom borders", async ({ expect }) => {
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
  // G05+G15 fix: side rails now render even at h=1 when both top and bottom are
  // hidden — the per-edge geometry draws them at the single content row (Ink parity)
  expect(lastFrame()).toMatchInlineSnapshot(`
    "Above
    │Content│
    Below"
  `);
});

// hide left border
test("hide left border", async ({ expect }) => {
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
test("hide right border", async ({ expect }) => {
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
test("hide left and right border", async ({ expect }) => {
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
test("hide all borders", async ({ expect }) => {
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
test("change color of top border", async ({ expect }) => {
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
test("change color of bottom border", async ({ expect }) => {
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
test("change color of left border", async ({ expect }) => {
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
test("change color of right border", async ({ expect }) => {
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
test("custom border style", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="arrow">
        <Text>Content</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "↘↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↙
    →Content                                                                                           ←
    ↗↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↖"
  `);
});

// arrow border on narrow box does not overflow
test("arrow border on narrow box does not overflow", async ({ expect }) => {
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
    expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(3);
  }
  const stripped = stripAnsi(frame);
  expect(stripped.split("\n")[0]).toContain("↘");
  expect(stripped.split("\n")[2]).toContain("↗");
});

// dim border color
test("dim border color", async ({ expect }) => {
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
test("dim top border color", async ({ expect }) => {
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
test("dim bottom border color", async ({ expect }) => {
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
test("dim left border color", async ({ expect }) => {
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
test("dim right border color", async ({ expect }) => {
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

// --- borderBackgroundColor tests (ported from Ink border-backgrounds.tsx) ---

test("border with background color", async ({ expect }) => {
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
  const frame = lastFrame()!;
  expect(frame).toContain("┌");
  expect(frame).toContain("┐");
  expect(frame).toContain("└");
  expect(frame).toContain("┘");
  expect(frame).toContain("Test");
  // Blue background: ESC[44m
  expect(frame).toContain("[44m");
});

test("border with different background colors per side", async ({ expect }) => {
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
  const frame = lastFrame()!;
  expect(frame).toContain("┌");
  expect(frame).toContain("Test");
  // red=41, green=42, yellow=43, blue=44
  expect(frame).toContain("[41m");
  expect(frame).toContain("[42m");
  expect(frame).toContain("[43m");
  expect(frame).toContain("[44m");
});

test("border background color fallback to general borderBackgroundColor", async ({ expect }) => {
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
  const frame = lastFrame()!;
  // cyan=46, magenta=45
  expect(frame).toContain("[46m");
  expect(frame).toContain("[45m");
});

test("vertical border background does not bleed into content rows", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="classic" borderBackgroundColor="cyan" alignSelf="flex-start" width={12}>
        <Text>Text longer than the Box width, so will definitely wrap.</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const frame = lastFrame()!;
  const bgCyanPattern = "\\[46m";
  const bgResetPattern = "\\[49m";
  const tableBorderChar = "|";
  const tableBorderPattern = bgCyanPattern + tableBorderChar + bgResetPattern;
  const contentRowPattern = new RegExp(`^${tableBorderPattern}.*${tableBorderPattern}$`);
  const tableRows = frame.split("\n");
  const contentRows = tableRows.slice(1, -1);
  for (const contentRow of contentRows) {
    expect(contentRow).toMatch(contentRowPattern);
  }
});

test("foreground, background and dim combine correctly", async ({ expect }) => {
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
  const frame = lastFrame()!;
  // EXACT-byte parity with Ink's render-border.ts stylePiece (commit 40b3a75,
  // lines 7-20): fg INNERMOST, then bg, then dim OUTERMOST —
  // chalk.dim(chalk.bgCyan(chalk.red(glyphs))). With chalk level 3 the open
  // codes nest dim(2) -> bg(46) -> fg(31) and close fg(39) -> bg(49) -> dim(22).
  // A lax `.toContain('[31m')` etc. would pass even with the wrong (Text-style,
  // dim-innermost) nesting, so assert the precise byte windows.
  const topLine = frame.split("\n")[0]!;
  expect(topLine).toContain("\x1b[2m\x1b[46m\x1b[31m");
  expect(topLine).toContain("\x1b[39m\x1b[49m\x1b[22m");
});

test("border side rails: foreground, background and dim combine in Ink byte order", async ({
  expect,
}) => {
  // Exercises a vertical edge (left rail) — colorizeEdge is the single shared
  // path for all four edges, so this guards the same SGR ordering on the rails.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        borderLeftDimColor
        borderStyle="single"
        borderLeftColor="red"
        borderLeftBackgroundColor="cyan"
        alignSelf="flex-start"
      >
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const frame = lastFrame()!;
  // The left rail glyph │ lives on the content row (row index 1). Same Ink
  // stylePiece order as the top edge: dim(2) -> bg(46) -> fg(31), close
  // fg(39) -> bg(49) -> dim(22).
  const railRow = frame.split("\n")[1]!;
  expect(railRow).toContain("\x1b[2m\x1b[46m\x1b[31m");
  expect(railRow).toContain("\x1b[39m\x1b[49m\x1b[22m");
});

test("border foreground + background (no dim) nests bg outer, fg inner like Ink", async ({
  expect,
}) => {
  // The no-dim subset must also match Ink's stylePiece: colorize(colorize(glyph,
  // fg,'foreground'), bg,'background') => bg(46) outer, fg(31) inner, no dim wrap.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
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
  const topLine = lastFrame()!.split("\n")[0]!;
  expect(topLine).toContain("\x1b[46m\x1b[31m");
  expect(topLine).toContain("\x1b[39m\x1b[49m");
  // and NO dim code on this edge
  expect(topLine).not.toContain("\x1b[2m");
});

// G05 — height-1 box with side-only borders renders rails (Ink parity)
// A box that is exactly 1 cell tall (borderTop/Bottom=false) must still render
// the left and right rails on the single content row, producing │X│ output.
// Previously the blanket `w < 2 || h < 2` guard aborted the entire drawBorder.
test("G05: height-1 box with side-only borders renders rails", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      // height=1 → only 1 row; no top/bottom borders, only left+right rails
      <Box borderStyle="single" borderTop={false} borderBottom={false} alignSelf="flex-start">
        <Text>X</Text>
      </Box>
    )),
    { columns: 20 },
  );
  const frame = stripAnsi(lastFrame()!);
  // The single row must carry the left AND right rails
  expect(frame).toContain("│X│");
});

// G05 — width-1 box with top/bottom-only borders renders the edge glyphs (Ink parity)
// A box that is exactly 1 cell wide (after removing left/right borders) must still
// render the top and bottom horizontal edges, each a single glyph.
test("G05: width-1 box with top/bottom-only borders renders edge glyphs", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      // width=1 content area; no left/right borders; only top+bottom
      <Box
        borderStyle="single"
        borderLeft={false}
        borderRight={false}
        width={1}
        alignSelf="flex-start"
      >
        <Text>X</Text>
      </Box>
    )),
    { columns: 20 },
  );
  const frame = stripAnsi(lastFrame()!);
  const lines = frame.split("\n");
  // Top edge must be present (─)
  expect(lines[0]).toContain("─");
  // Bottom edge must be present (─)
  expect(lines[lines.length - 1]).toContain("─");
});

// G15 — vertical side rails are not shifted down when borderTop=false (Ink parity)
// With borderTop=false, the vertical sides must start at row 0 (the content row),
// not row 1 (which is how the buggy i=1 loop positioned them).
test("G15: side rails appear on the first content row when borderTop=false", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="single" borderTop={false} alignSelf="flex-start">
        <Text>Content</Text>
      </Box>
    )),
    { columns: 20 },
  );
  const frame = stripAnsi(lastFrame()!);
  const lines = frame.split("\n");
  // First line is the content row (no top border); it must carry both rails.
  // The "single" style uses │ (U+2502 BOX DRAWINGS LIGHT VERTICAL), not ASCII |.
  expect(lines[0]).toMatch(/^│.*│$/);
});

// G13 — custom BoxStyle border object (Ink parity)
// Ink allows borderStyle to be a BoxStyle object with custom glyph characters.
// vue-tui must resolve it directly instead of looking it up in cliBoxes.
test("G13: custom border object renders correct glyphs", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        borderStyle={{
          topLeft: "A",
          top: "B",
          topRight: "C",
          right: "D",
          bottomRight: "E",
          bottom: "F",
          bottomLeft: "G",
          left: "H",
        }}
        alignSelf="flex-start"
      >
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const frame = stripAnsi(lastFrame()!);
  const lines = frame.split("\n");
  // Top row: A + B...B + C
  expect(lines[0]).toMatch(/^AB+C$/);
  // Content row: H + text + D
  expect(lines[1]).toMatch(/^H.*D$/);
  // Bottom row: G + F...F + E
  expect(lines[2]).toMatch(/^GF+E$/);
});

// G16 — per-edge borderDimColor=false can override general borderDimColor (Ink parity)
// With borderDimColor (general dim ON) and borderTopDimColor={false} (top dim explicitly OFF),
// the top border must NOT be dim while other edges (e.g. bottom) remain dim.
// Before the fix, `false || true` = true caused the top edge to be wrongly dimmed.
test("G16: per-edge borderDimColor=false overrides general borderDimColor", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="single" borderDimColor borderTopDimColor={false} alignSelf="flex-start">
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const frame = lastFrame()!;
  const lines = frame.split("\n");
  const topLine = lines[0]!;
  const bottomLine = lines[lines.length - 1]!;
  // Top border must NOT contain dim ANSI code (\x1b[2m / "[2m")
  expect(topLine).not.toContain("[2m");
  // Bottom border MUST contain dim ANSI code (general dim still applies)
  expect(bottomLine).toContain("[2m");
});

// audit 2.3 — an UNKNOWN borderStyle string THROWS (Ink parity), rather than
// silently degrading to no border (the old vue-tui behavior, which also wrongly
// reserved a 1-cell inset). Ink's render-border.ts has no existence check: it
// reads box.topLeft/box.top off `cliBoxes[name]` === undefined and crashes with a
// TypeError. We align by throwing a clear, descriptive Error — but do it in the
// Box component's RENDER (Box.ts), so the throw is caught by vue-tui's existing
// error boundary (onErrorCaptured → ErrorOverview → exit), exactly like any other
// component render error. paint.ts stays a silent `if (!chars) return` fallback
// (a raw throw in the post-flush commit would wedge Vue's scheduler).
//
// OBSERVED behavior: the error boundary routes the thrown Error through exit(),
// which REJECTS waitUntilExit(); @vue-tui/testing's render() surfaces that
// rejection (its earlyError detector rethrows before returning a result), so
// render() itself REJECTS with the message. The ErrorOverview frame is rendered
// internally but never reaches the caller — render() never resolves a result.
// (TS-bypass via `as any`: the public prop type is the cli-boxes keyof union, so
// an unknown name is reachable only by escaping the type system.)
test("UNKNOWN borderStyle throws (Ink parity)", async ({ expect }) => {
  await expect(
    render(
      defineComponent(() => () => (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <Box borderStyle={"definitely-not-a-real-style" as any} alignSelf="flex-start">
          <Text>Hi</Text>
        </Box>
      )),
      { columns: 100 },
    ),
  ).rejects.toThrow(/Unknown borderStyle/);
});

// A bare `in cliBoxes` membership check has two false-accept holes that these
// guard against:
//   1. cli-boxes' CJS-interop `default` self-key — `"default" in cliBoxes` is true,
//      but cliBoxes.default is the WHOLE boxes object, not a BoxStyle (no string
//      `.top`). Paint would then read `.top`/`.topLeft` off it → garbage/crash.
//   2. `in` walks the prototype chain, so Object.prototype members like
//      "toString"/"constructor"/"hasOwnProperty" report as "in cliBoxes" while
//      resolving to a function/undefined — never a real BoxStyle.
// A shape check (resolved value is an object with a string `top`) rejects all of
// these. Each name must THROW exactly like any other unknown style.
for (const badName of ["default", "toString", "constructor", "hasOwnProperty"]) {
  test(`borderStyle ${JSON.stringify(badName)} (in-cliBoxes false-accept) throws`, async ({
    expect,
  }) => {
    await expect(
      render(
        defineComponent(() => () => (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <Box borderStyle={badName as any} alignSelf="flex-start">
            <Text>Hi</Text>
          </Box>
        )),
        { columns: 100 },
      ),
    ).rejects.toThrow(/Unknown borderStyle/);
  });
}

// Guard the negative cases that MUST NOT throw — only a non-empty unknown STRING
// does. The Box-render check skips any falsy borderStyle (false/undefined/"" =
// "no border"), every valid cli-boxes preset name, and a custom BoxStyle OBJECT
// (Ink types borderStyle as `keyof Boxes | BoxStyle`). We assert each renders
// normally (no rejection from render()) and that a valid style/object actually
// draws border glyphs while a falsy one draws none. (`false` is reachable only
// via a TS-bypass — Ink's type has no `false`.)
test("non-throwing borderStyle (false/undefined/valid/object) renders normally", async ({
  expect,
}) => {
  const falseResult = await render(
    defineComponent(() => () => (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Box borderStyle={false as any} alignSelf="flex-start">
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const falseFrame = stripAnsi(falseResult.lastFrame()!);
  expect(falseFrame).toContain("Hi");
  // No box-drawing glyphs of any border style appear.
  expect(falseFrame).not.toMatch(/[╭╮╰╯─│┌┐└┘╔╗╚╝═║↘↗↖↙]/);

  const undefinedResult = await render(
    defineComponent(() => () => (
      <Box borderStyle={undefined} alignSelf="flex-start">
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const undefinedFrame = stripAnsi(undefinedResult.lastFrame()!);
  expect(undefinedFrame).toContain("Hi");
  expect(undefinedFrame).not.toMatch(/[╭╮╰╯─│┌┐└┘╔╗╚╝═║↘↗↖↙]/);

  // A valid preset name renders its border (here `round` → ╭╮╰╯), no throw.
  const validResult = await render(
    defineComponent(() => () => (
      <Box borderStyle="round" alignSelf="flex-start">
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const validFrame = stripAnsi(validResult.lastFrame()!);
  expect(validFrame).toContain("Hi");
  expect(validFrame).toMatch(/[╭╮╰╯]/);

  // A custom BoxStyle OBJECT is valid (Ink parity G13) and must NOT throw — the
  // check only fires for an unknown STRING. The object's own glyphs render.
  const customStyle = {
    topLeft: "A",
    top: "B",
    topRight: "C",
    left: "D",
    right: "E",
    bottomLeft: "F",
    bottom: "G",
    bottomRight: "H",
  };
  const objectResult = await render(
    defineComponent(() => () => (
      <Box borderStyle={customStyle} alignSelf="flex-start">
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const objectFrame = stripAnsi(objectResult.lastFrame()!);
  expect(objectFrame).toContain("Hi");
  // Corner glyphs from the custom object are drawn.
  expect(objectFrame).toContain("A");
  expect(objectFrame).toContain("H");
});

// borderDimColor should not dim styled child Text touching left edge
test("borderDimColor does not dim styled child Text touching left edge", async ({ expect }) => {
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
    [2m│[22m[1m[34mstyled text[39m[22m[2m│[22m
    [2m╰───────────╯[22m"
  `);
});
