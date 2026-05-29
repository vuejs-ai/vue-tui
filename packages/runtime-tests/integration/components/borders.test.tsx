import { defineComponent, shallowRef, nextTick } from "vue";
import { test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, measureText } from "@vue-tui/runtime";
import stripAnsi from "strip-ansi";

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
    expect(measureText(stripAnsi(line), 9999).width).toBeLessThanOrEqual(3);
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
  // red FG=31, cyan BG=46, dim=2
  expect(frame).toContain("[31m");
  expect(frame).toContain("[46m");
  expect(frame).toContain("[2m");
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
    [2m│[22m[34m[1mstyled text[22m[39m[2m│[22m
    [2m╰───────────╯[22m"
  `);
});
