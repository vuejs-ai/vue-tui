import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, renderToString, Text } from "@vue-tui/runtime";

// ── Text variants ──────────────────────────────────────

test("renders text with interpolated variable", () => {
  const App = defineComponent(() => () => <Text>Count: {42}</Text>);
  const output = renderToString(App);
  expect(output).toBe("Count: 42");
});

test("renders nested text components", () => {
  const World = defineComponent(() => () => <Text>World</Text>);
  const App = defineComponent(() => () => (
    <Text>
      Hello <World />
    </Text>
  ));
  const output = renderToString(App);
  expect(output).toBe("Hello World");
});

test("renders empty fragment", () => {
  const App = defineComponent(() => () => <></>);
  const output = renderToString(App);
  expect(output).toBe("");
});

test("renders null children", () => {
  const App = defineComponent(() => () => <Text>{null}</Text>);
  const output = renderToString(App);
  expect(output).toBe("");
});

test("renders deeply nested component tree", () => {
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Box paddingLeft={1}>
        <Box>
          <Text bold>
            {"Nested "}
            <Text color="green">deep</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  ));
  const output = renderToString(App);
  expect(output).toContain("Nested");
  expect(output).toContain("deep");
});
