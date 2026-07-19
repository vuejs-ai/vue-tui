import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import chalk from "chalk";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

const BG_BLUE = "\x1b[44m";
const BG_CYAN = "\x1b[46m";
const BG_GREEN = "\x1b[42m";
const BG_RED = "\x1b[41m";

test("Box backgroundColor paints its content area", async () => {
  const { frames } = await render(() => <Box backgroundColor="blue" width={5} height={2} />, {
    columns: 10,
  });

  const raw = frames.at(-1)!.dynamic;
  expect(raw).toContain(chalk.bgBlue("     "));
  expect(raw.split("\n")).toHaveLength(2);
});

test("Box backgroundColor does not bleed onto border glyphs", async () => {
  const { frames } = await render(
    () => <Box backgroundColor="cyan" borderStyle="round" width={10} height={4} />,
    { columns: 20 },
  );

  const lines = frames.at(-1)!.dynamic.split("\n");
  expect(lines[0]).not.toContain(BG_CYAN);
  expect(lines[1]).toContain(BG_CYAN);
  expect(lines.at(-1)).not.toContain(BG_CYAN);
});

test("Text inherits its parent Box backgroundColor", async () => {
  const { frames } = await render(
    () => (
      <Box backgroundColor="green" width={11}>
        <Text>Hello World</Text>
      </Box>
    ),
    { columns: 20 },
  );

  expect(frames.at(-1)!.dynamic).toContain(chalk.bgGreen("Hello World"));
});

test("Text backgroundColor overrides an inherited Box backgroundColor", async () => {
  const { frames } = await render(
    () => (
      <Box backgroundColor="red" width={11}>
        <Text backgroundColor="blue">Hello World</Text>
      </Box>
    ),
    { columns: 20 },
  );

  const raw = frames.at(-1)!.dynamic;
  expect(raw).toContain(chalk.bgBlue("Hello World"));
  expect(raw).not.toContain(BG_RED);
});

test("a nested Box backgroundColor overrides its ancestor", async () => {
  const { frames } = await render(
    () => (
      <Box backgroundColor="red" width={11}>
        <Box backgroundColor="blue" width={11}>
          <Text>Hello World</Text>
        </Box>
      </Box>
    ),
    { columns: 20 },
  );

  expect(frames.at(-1)!.dynamic).toContain(chalk.bgBlue("Hello World"));
});

test("wrapped Box content keeps the background on each content row", async () => {
  const { frames } = await render(
    () => (
      <Box backgroundColor="blue" borderStyle="single" width={8} height={5}>
        <Text>long text here</Text>
      </Box>
    ),
    { columns: 20 },
  );

  const lines = frames.at(-1)!.dynamic.split("\n");
  expect(lines[0]).not.toContain(BG_BLUE);
  expect(lines.at(-1)).not.toContain(BG_BLUE);
  for (const line of lines.slice(1, -1)) expect(line).toContain(BG_BLUE);
});

test("hex backgrounds are supported by Box and Text", async () => {
  const { lastFrame } = await render(
    () => (
      <Box backgroundColor="#00ff00" width={2}>
        <Text backgroundColor="#ff0000">X</Text>
      </Box>
    ),
    { columns: 10 },
  );

  expect(lastFrame()).toContain("\x1b[48;2;255;0;0mX");
  expect(lastFrame()).toContain("\x1b[48;2;0;255;0m ");
});

test("Box backgroundColor updates reactively", async () => {
  const color = shallowRef<"red" | "blue">("red");
  const App = defineComponent(() => () => (
    <Box backgroundColor={color.value} width={4} height={1} />
  ));
  const result = await render(App, { columns: 10 });

  expect(result.frames.at(-1)!.dynamic).toContain(BG_RED);
  color.value = "blue";
  await nextTick();
  await result.waitUntilRenderFlush();
  expect(result.frames.at(-1)!.dynamic).toContain(BG_BLUE);
});

test("Text backgroundColor colors text without filling its parent Box", async () => {
  const { frames } = await render(
    () => (
      <Box width={6}>
        <Text backgroundColor="green">Hi</Text>
      </Box>
    ),
    { columns: 10 },
  );

  const raw = frames.at(-1)!.dynamic;
  expect(raw).toContain(chalk.bgGreen("Hi"));
  expect(raw.match(new RegExp(BG_GREEN.replace("[", "\\["), "g"))?.length).toBe(1);
});
