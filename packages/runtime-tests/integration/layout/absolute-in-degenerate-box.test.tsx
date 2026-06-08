import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

// A Box whose inner content area collapses to zero must still paint its
// position:"absolute" children — an absolutely-positioned child is placed
// against the containing block (border-box), not the (nonexistent) content
// rect, so the zero-content guard must not suppress it. Ink v7.0.4 paints
// these (verified by running real Ink: a w=2 h=2 single-border box with an
// absolute child renders "┌┐#\n└X"); vue-tui previously suppressed ALL
// children, including absolute ones, rendering "┌┐#\n└┘".

test("absolute child paints when border eats the whole content area (w=2 h=2)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box>
        <Box width={2} height={2} borderStyle="single">
          <Box position="absolute" top={0} left={0}>
            <Text>X</Text>
          </Box>
        </Box>
        <Text>#</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toContain("X");
});

test("flow (non-absolute) child stays suppressed when the content area is zero", async () => {
  // The blessed degenerate-box divergence: a normal flow child in a zero-content
  // box does NOT paint (avoids Ink's zero-width-text leak). This must stay true.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box>
        <Box width={2} height={2} borderStyle="single">
          <Text>Y</Text>
        </Box>
        <Text>#</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).not.toContain("Y");
});
