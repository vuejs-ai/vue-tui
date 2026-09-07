import { defineComponent } from "vue";
import { test, expect } from "vite-plus/test";
import { renderToString, Box, Text } from "@vue-tui/runtime";

// One `Text` whose content is several physical lines is painted as a single
// multi-line write, so a negative `top` puts that write's origin above row 0.
// The rows that still land on the surface must survive.
function overlayAt(top: number): string[] {
  const output = renderToString(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>base1</Text>
        <Text>base2</Text>
        <Text>base3</Text>
        <Box position="absolute" top={top} left={0}>
          <Text>{"L1\nL2\nL3"}</Text>
        </Box>
      </Box>
    )),
    { width: 10 },
  );
  return output.split("\n");
}

test("a multi-line write starting above the surface keeps its visible rows", () => {
  expect(overlayAt(0)).toEqual(["L1se1", "L2se2", "L3se3"]);
  expect(overlayAt(-1)).toEqual(["L2se1", "L3se2", "base3"]);
  expect(overlayAt(-2)).toEqual(["L3se1", "base2", "base3"]);
});

test("a multi-line write starting below the surface paints nothing", () => {
  expect(overlayAt(3)).toEqual(["base1", "base2", "base3"]);
});
