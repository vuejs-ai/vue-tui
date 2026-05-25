import { defineComponent, shallowRef, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";
import chalk from "chalk";
import stripAnsi from "strip-ansi";

test("nested Text renders inline without independent layout", async () => {
  const { lastFrame } = await render(() => (
    <Text>
      Hello <Text color="red">world</Text>
    </Text>
  ));
  const frame = lastFrame()!;
  expect(frame).toContain("Hello");
  expect(frame).toContain("world");
});

test("CJK wide characters render without corruption", async () => {
  const { lastFrame } = await render(() => <Text>中文测试</Text>, { columns: 20 });
  const frame = lastFrame()!;
  expect(frame).toContain("中文测试");
});

// --- Ink text tests ---

test.skip("<Text> with undefined children — crashes yoga measure", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text />),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("");
});

test.skip("<Text> with null children — crashes yoga measure", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text>{null}</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("");
});

test("text with standard color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text color="green">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.green("Test"));
});

test("text with dim+bold", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text dimColor bold>
        Test
      </Text>
    )),
    { columns: 100 },
  );
  expect(stripAnsi(lastFrame()!)).toBe("Test");
  expect(lastFrame()).not.toBe("Test");
});

test("text with dimmed color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text dimColor color="green">
        Test
      </Text>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.green.dim("Test"));
});

test("text with hex color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text color="#FF8800">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.hex("#FF8800")("Test"));
});

test("text with rgb color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text color="rgb(255, 136, 0)">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.rgb(255, 136, 0)("Test"));
});

test("text with ansi256 color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text color="ansi256(194)">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.ansi256(194)("Test"));
});

test("text with standard background color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text backgroundColor="green">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.bgGreen("Test"));
});

test("text with hex background color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text backgroundColor="#FF8800">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.bgHex("#FF8800")("Test"));
});

test("text with rgb background color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text backgroundColor="rgb(255, 136, 0)">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.bgRgb(255, 136, 0)("Test"));
});

test("text with ansi256 background color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text backgroundColor="ansi256(194)">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.bgAnsi256(194)("Test"));
});

test("text with inversion", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text inverse>Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.inverse("Test"));
});

test("text with empty-to-nonempty sibling does not wrap", async () => {
  const show = shallowRef(false);
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box>
        <Text>{show.value ? "x" : ""}hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("hello");
  show.value = true;
  await nextTick();
  expect(lastFrame()).toBe("xhello");
});

test("remeasure text when text is changed", async () => {
  const add = shallowRef(false);
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box>
        <Text>{add.value ? "abcx" : "abc"}</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("abc");
  add.value = true;
  await nextTick();
  expect(lastFrame()).toBe("abcx");
});

test.skip("remeasure text when text nodes are changed — null child crashes yoga", async () => {
  const add = shallowRef(false);
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box>
        <Text>abc{add.value ? <Text>x</Text> : null}</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("abc");
  add.value = true;
  await nextTick();
  expect(lastFrame()).toBe("abcx");
});

test.skip("text with content 'constructor' wraps correctly — bug in text node lookup", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text>constructor</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("constructor");
});
