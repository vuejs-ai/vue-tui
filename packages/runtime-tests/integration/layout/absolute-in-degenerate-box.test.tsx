import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

// A Box whose inner content area collapses to zero must still paint its
// position:"absolute" children — an absolutely-positioned child is placed
// against its containing block, the **padding box** (the area inside the
// borders; padding itself does NOT inset it), not the (nonexistent) content
// rect, so the zero-content guard must not suppress it. Ink v7.0.4 paints
// these (verified by running real Ink); vue-tui previously suppressed ALL
// children. Flow children stay suppressed (the blessed degenerate-box
// divergence).
//
// Assertions use exact frames (not `toContain`) so they pin WHERE the child
// lands — the padding-box edge — distinguishing it from the border box and
// the content box.

test("absolute child paints at the padding-box edge when content area is zero (w=2 h=2)", async () => {
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
  // X lands at the inner-border (padding-box) corner — it replaces the `┘`.
  expect(lastFrame()).toBe("┌┐#\n└X");
});

test("absolute child positions against the padding box, not the content box", async () => {
  // Discriminator: with border=1 AND padding=1, the padding-box edge is at
  // row 1 / col 1 (inside the border, before padding). A content-box containing
  // block would instead put X at row 2 / col 2. Verified byte-identical in real
  // Ink v7.0.4. This is the assertion that would have caught a "border-box" vs
  // "padding-box" mistake.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        width={7}
        height={5}
        borderStyle="single"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Box position="absolute" top={0} left={0}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("┌─────┐\n│X    │\n│     │\n│     │\n└─────┘");
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
  expect(lastFrame()).toBe("┌┐#\n└┘");
});
