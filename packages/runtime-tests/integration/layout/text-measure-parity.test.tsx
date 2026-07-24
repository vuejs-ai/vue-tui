import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";
import stripAnsi from "strip-ansi";

test("multi-line truncate text keeps its line count (height)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={24}>
        <Text wrap="truncate">{"x\nyhello"}</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const lines = stripAnsi(lastFrame({ trimLines: true })!).split("\n");
  expect(lines.length).toBe(2);
  expect(lines[0]).toBe("x");
  expect(lines[1]).toBe("yhello");
});

// The public contract deliberately differs from Ink's doubly-truncated
// multiline quirk: each hard line keeps the final Box content width and is
// truncated independently, so a short first line cannot shrink a later line's
// budget or discard it.
test("narrow truncate keeps the final width budget for every hard line", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={5}>
        <Text wrap="truncate">{"x\nyhello"}</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const lines = stripAnsi(lastFrame()!).split("\n");
  expect(lines[0]).toBe("x");
  expect(lines[1]).toBe("yhel…");
});

// Ink measure-text.tsx returns height 0 for empty text (text.length === 0), and
// the yoga measure func short-circuits raw === "" to {width:0,height:0}. So an
// empty <Text> in a column contributes NO row — the only visible line is the
// non-empty sibling, with NO leading blank line above it.
test("empty <Text> in a column contributes height 0 (no leading blank line)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>{""}</Text>
        <Text>hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Single line "hello" — the empty text adds no row above it.
  expect(lastFrame()).toBe("hello");
});
