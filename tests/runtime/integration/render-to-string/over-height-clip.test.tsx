import { defineComponent } from "vue";
import { test, expect } from "vite-plus/test";
import { renderToString, Box, Text } from "@vue-tui/runtime";

// `renderToString()` models one finite page. A child the author gave a height is
// fitted to it as asked; a child with no height of its own has nothing to fit, so
// shrinking it only collapses the content inside it and the document loses rows
// from its middle.

test("a column taller than the row bound keeps its first rows in order", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box flexDirection="column">
        {Array.from({ length: 30 }, (_, index) => (
          <Text key={index}>{`line${index + 1}`}</Text>
        ))}
      </Box>
    )),
    { width: 20, height: 24 },
  );

  expect(output.split("\n")).toEqual(Array.from({ length: 24 }, (_, index) => `line${index + 1}`));
});

test("an author-sized Box inside an over-height document keeps its own rows", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box height={4} flexDirection="column">
          {["A1", "A2", "A3", "A4"].map((label) => (
            <Text key={label}>{label}</Text>
          ))}
        </Box>
        {Array.from({ length: 10 }, (_, index) => (
          <Text key={index}>{`line${index + 1}`}</Text>
        ))}
      </Box>
    )),
    { width: 12, height: 13 },
  );

  expect(output.split("\n")).toEqual([
    "A1",
    "A2",
    "A3",
    "A4",
    ...Array.from({ length: 9 }, (_, index) => `line${index + 1}`),
  ]);
});
