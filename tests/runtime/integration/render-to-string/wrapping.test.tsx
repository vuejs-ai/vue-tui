import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, renderToString, Text } from "@vue-tui/runtime";

// ── Text wrapping and columns ─────────────────────────

test("renders text with wrap", () => {
  const App = defineComponent(() => () => (
    <Box width={7}>
      <Text wrap="wrap">Hello World</Text>
    </Box>
  ));
  const output = renderToString(App);
  expect(output).toBe("Hello\nWorld");
});

test("renders text with truncate", () => {
  const App = defineComponent(() => () => (
    <Box width={7}>
      <Text wrap="truncate">Hello World</Text>
    </Box>
  ));
  const output = renderToString(App);
  expect(output).toBe("Hello …");
});

test("default columns wraps text at 80", () => {
  const longText = "A".repeat(100);
  const App = defineComponent(() => () => <Text>{longText}</Text>);
  const output = renderToString(App);
  const lines = output.split("\n");
  expect(lines.length).toBe(2);
  expect(lines[0]).toBe("A".repeat(80));
  expect(lines[1]).toBe("A".repeat(20));
});

test("custom columns option", () => {
  const longText = "A".repeat(50);
  const App = defineComponent(() => () => <Text>{longText}</Text>);
  const output = renderToString(App, { width: 30 });
  const lines = output.split("\n");
  expect(lines.length).toBe(2);
  expect(lines[0]).toBe("A".repeat(30));
  expect(lines[1]).toBe("A".repeat(20));
});
