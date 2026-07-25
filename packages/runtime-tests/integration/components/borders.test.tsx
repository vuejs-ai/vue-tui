import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import stripAnsi from "strip-ansi";
import stringWidth from "string-width";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("round border renders around content", async () => {
  const { lastFrame } = await render(
    () => (
      <Box borderStyle="round" width={14}>
        <Text>Hello World</Text>
      </Box>
    ),
    { columns: 20 },
  );

  expect(lastFrame()).toBe("╭────────────╮\n│Hello World │\n╰────────────╯");
});

test("single and round styles use their advertised glyphs", async () => {
  const single = await render(() => <Box borderStyle="single" width={4} />, { columns: 10 });
  const round = await render(() => <Box borderStyle="round" width={4} />, { columns: 10 });

  expect(single.lastFrame()).toBe("┌──┐\n└──┘");
  expect(round.lastFrame()).toBe("╭──╮\n╰──╯");
});

test("borderColor colors every border edge without coloring content", async () => {
  const { frames } = await render(
    () => (
      <Box borderStyle="single" borderColor="green" width={6} height={3}>
        <Text>X</Text>
      </Box>
    ),
    { columns: 10 },
  );

  const raw = frames.at(-1)!.dynamic;
  expect(raw).toContain("\x1b[32m┌────┐\x1b[39m");
  expect(raw).toContain("\x1b[32m│\x1b[39mX");
  expect(raw).not.toContain("\x1b[32mX");
});

test("fixed border dimensions include the border cells", async () => {
  const { lastFrame } = await render(
    () => (
      <Box borderStyle="single" width={8} height={4}>
        <Text>abc</Text>
      </Box>
    ),
    { columns: 12 },
  );

  const lines = stripAnsi(lastFrame()!).split("\n");
  expect(lines).toHaveLength(4);
  expect(lines.every((line) => stringWidth(line) === 8)).toBe(true);
});

test("individual padding props reserve space inside a border", async () => {
  const { lastFrame } = await render(
    () => (
      <Box
        borderStyle="single"
        width={9}
        height={5}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text>X</Text>
      </Box>
    ),
    { columns: 12 },
  );

  expect(stripAnsi(lastFrame()!)).toBe("┌───────┐\n│       │\n│ X     │\n│       │\n└───────┘");
});

test("border width accounts for wide characters", async () => {
  const { lastFrame } = await render(
    () => (
      <Box borderStyle="round" width={8}>
        <Text>界界</Text>
      </Box>
    ),
    { columns: 12 },
  );

  const lines = stripAnsi(lastFrame()!).split("\n");
  expect(lines.every((line) => stringWidth(line) === 8)).toBe(true);
  expect(lines[1]).toContain("界界");
});

test("text wraps within the inner width of a border", async () => {
  const { lastFrame } = await render(
    () => (
      <Box borderStyle="single" width={8}>
        <Text>abcdefghij</Text>
      </Box>
    ),
    { columns: 12 },
  );

  expect(stripAnsi(lastFrame()!)).toBe("┌──────┐\n│abcdef│\n│ghij  │\n└──────┘");
});

test("nested borders remain independently visible", async () => {
  const { lastFrame } = await render(
    () => (
      <Box borderStyle="round" width={12}>
        <Box borderStyle="single" width={8}>
          <Text>X</Text>
        </Box>
      </Box>
    ),
    { columns: 16 },
  );

  const frame = stripAnsi(lastFrame()!);
  expect(frame).toContain("╭──────────╮");
  expect(frame).toContain("┌──────┐");
  expect(frame).toContain("X");
});

test("borderStyle removal clears its glyphs and layout inset before it can be re-added", async () => {
  const style = shallowRef<"single" | "round" | undefined>("single");
  const App = defineComponent(() => () => (
    <Box borderStyle={style.value} width={4}>
      <Text>X</Text>
    </Box>
  ));
  const result = await render(App, { columns: 10 });

  expect(result.lastFrame()).toContain("┌");
  style.value = "round";
  await nextTick();
  await result.waitUntilRenderFlush();
  expect(result.lastFrame()).toContain("╭");

  style.value = undefined;
  await nextTick();
  await result.waitUntilRenderFlush();
  expect(result.lastFrame()).toBe("X");

  style.value = "single";
  await nextTick();
  await result.waitUntilRenderFlush();
  expect(result.lastFrame()).toBe("┌──┐\n│X │\n└──┘");
});
