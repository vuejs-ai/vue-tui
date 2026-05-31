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

// Narrow truncate: when the text exceeds the box width, Ink re-measures the
// wrapped text (so the node width shrinks to the truncated widest line) and
// then truncates again at paint, yielding a doubly-truncated result. Verified
// against real Ink (ink-testing-library): width=5 → ["x","…"]. This is
// intentional Ink parity — do NOT "fix" it to one-pass truncation (["x","yh…"]).
test("narrow truncate matches Ink's re-measure-then-truncate behavior", async () => {
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
  expect(lines[1]).toBe("…");
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
