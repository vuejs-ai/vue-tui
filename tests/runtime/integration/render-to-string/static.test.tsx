import { defineComponent } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Box, renderToString, Text } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";

describe("renderToString Static output", () => {
  test("renders keyed Static instances", () => {
    const items = ["A", "B", "C"];
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        {items.map((item) => (
          <Static key={item}>
            <Text>{item}</Text>
          </Static>
        ))}
        <Text>Dynamic</Text>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("A\nB\nC\nDynamic");
  });

  test("render static-only output has no trailing newline", () => {
    const items = ["A", "B"];
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        {items.map((item) => (
          <Static key={item}>
            <Text>{item}</Text>
          </Static>
        ))}
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("A\nB");
  });

  test("render static + dynamic output has exactly one newline between parts", () => {
    const items = ["A", "B"];
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        {items.map((item) => (
          <Static key={item}>
            <Text>{item}</Text>
          </Static>
        ))}
        <Text>Dynamic</Text>
      </Box>
    ));
    const output = renderToString(App);
    expect(output).toBe("A\nB\nDynamic");
  });

  test("an output-free Static adds no bytes to a string document", () => {
    const WithDynamicOutput = defineComponent(() => () => (
      <Box flexDirection="column">
        <Static>
          <Text>{""}</Text>
        </Static>
        <Text>Dynamic</Text>
      </Box>
    ));
    const StaticOnly = defineComponent(() => () => (
      <Static>
        <Text>{""}</Text>
      </Static>
    ));

    expect(renderToString(WithDynamicOutput)).toBe("Dynamic");
    expect(renderToString(StaticOnly)).toBe("");
  });

  // ── Effect behavior ────────────────────────────────────
});
