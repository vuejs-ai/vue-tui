import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, renderToString, Text } from "@vue-tui/runtime";

test("respects custom columns width", () => {
  const App = defineComponent(() => () => (
    <Box width="100%">
      <Text>full width</Text>
    </Box>
  ));
  const narrow = renderToString(App, { width: 20 });
  const wide = renderToString(App, { width: 60 });
  // Both should contain the text
  expect(narrow).toContain("full width");
  expect(wide).toContain("full width");
});

test("renders padding correctly", () => {
  const App = defineComponent(() => () => (
    <Box paddingLeft={2}>
      <Text>Padded</Text>
    </Box>
  ));
  const output = renderToString(App, { width: 20 });
  // Lock the EXACT bytes (Ink render-to-string.tsx: t.is(output, '  Padded')).
  expect(output).toBe("  Padded");
});

// ── Layout ─────────────────────────────────────────────

test("renders left padding", () => {
  const App = defineComponent(() => () => (
    <Box paddingLeft={2}>
      <Text>Margined</Text>
    </Box>
  ));
  const output = renderToString(App);
  expect(output).toBe("  Margined");
});

test("renders box with fixed width and height", () => {
  const App = defineComponent(() => () => (
    <Box width={10} height={3}>
      <Text>Hi</Text>
    </Box>
  ));
  const output = renderToString(App);
  const lines = output.split("\n");
  expect(lines.length).toBe(3);
});

test("renders box with border", () => {
  const App = defineComponent(() => () => (
    <Box borderStyle="single" width={20}>
      <Text>Bordered</Text>
    </Box>
  ));
  const output = renderToString(App, { width: 20 });
  // Lock the EXACT boxen frame: a 20-wide single border (top corner + 18 ─ + corner,
  // content row "Bordered" + 10 fill spaces, bottom border). Byte-identical to Ink's
  // boxen('Bordered', { width: 20, borderStyle: 'single' }) (render-to-string.tsx).
  expect(output).toBe("┌──────────────────┐\n" + "│Bordered          │\n" + "└──────────────────┘");
});

test("renders box with flex direction row", () => {
  const App = defineComponent(() => () => (
    <Box>
      <Text>A</Text>
      <Text>B</Text>
      <Text>C</Text>
    </Box>
  ));
  const output = renderToString(App);
  expect(output).toBe("ABC");
});

test("renders gap between items", () => {
  const App = defineComponent(() => () => (
    <Box gap={1}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>
  ));
  const output = renderToString(App);
  expect(output).toBe("A B");
});

test("renders column gap (blank line between stacked items)", () => {
  const App = defineComponent(() => () => (
    <Box flexDirection="column" gap={1}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>
  ));
  // Ink: t.is(output, 'A\n\nB')
  expect(renderToString(App)).toBe("A\n\nB");
});

test("renders an empty growing Box pushing content apart", () => {
  const App = defineComponent(() => () => (
    <Box width={20}>
      <Text>Left</Text>
      <Box flexGrow={1} flexShrink={1} />
      <Text>Right</Text>
    </Box>
  ));
  const output = renderToString(App);
  expect(output).toBe("Left           Right");
});

test("renders explicit newline text as a standalone layout item", () => {
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Text>Above</Text>
      <Text>{"\n"}</Text>
      <Text>Below</Text>
    </Box>
  ));
  const output = renderToString(App);
  expect(output).toBe("Above\n\n\nBelow");
});
