import { defineComponent } from "vue";
import { test, expect } from "vite-plus/test";
import { renderToString, Box, Text } from "@vue-tui/runtime";

// Measured Text keeps its resolved geometry off the pixel grid so measurement and
// paint quantize one width. Its painted origin still has to land on the same grid
// line the layout engine gave its siblings, or it writes over their cells.

test("a Text below a fractionally sized Box starts under that Box, not on its border", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box flexDirection="column" height={5}>
        <Box flexBasis="50%" borderStyle="single">
          <Text>A</Text>
        </Box>
        <Text>BBBB</Text>
      </Box>
    )),
    { width: 10, height: 5 },
  );

  const lines = output.split("\n");
  expect(lines[2]).toBe("└────────┘");
  expect(lines[3]).toBe("BBBB");
});

test("a centered Text sits on the same grid line a centered Box would", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={20} justifyContent="center">
        <Text>hello</Text>
      </Box>
    )),
    { width: 20 },
  );

  expect(output).toBe(`${" ".repeat(8)}hello`);
});
