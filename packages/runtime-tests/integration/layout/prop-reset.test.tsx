import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

// --- Ink prop-reset test ---
// Tests that removing a prop from an element resets the corresponding yoga layout value.

test("reset prop when it's removed from the element", async () => {
  const remove = shallowRef(false);

  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column" justifyContent="flex-end" height={remove.value ? undefined : 4}>
      <Text>x</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });

  // With height=4 and justifyContent="flex-end", "x" should appear at the bottom
  expect(lastFrame()).toBe("\n\n\nx");

  // Remove the height prop — box collapses to content height, x goes to top
  remove.value = true;
  await nextTick();

  expect(lastFrame()).toBe("x");
});

// G19: dynamic removal of yoga style props must reset to yoga/Ink default, not keep stale value.

test("reset marginTop to 0 on removal (G19)", async () => {
  // marginTop=4 adds 4 blank lines before 'x'; removing it should collapse to no margin.
  const hasMargin = shallowRef(true);

  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column" {...(hasMargin.value ? { marginTop: 4 } : {})}>
      <Text>x</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("\n\n\n\nx");

  hasMargin.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("x");
});

test("reset paddingTop to 0 on removal (G19)", async () => {
  // paddingTop=3 inside a column box pushes 'x' down 3 rows; removing should collapse.
  const hasPadding = shallowRef(true);

  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column" {...(hasPadding.value ? { paddingTop: 3 } : {})}>
      <Text>x</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("\n\n\nx");

  hasPadding.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("x");
});

test("reset minWidth to 0 on removal (G19)", async () => {
  // minWidth=10 forces a box to occupy at least 10 columns; removing should shrink to content.
  const hasMin = shallowRef(true);

  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="row">
      <Box {...(hasMin.value ? { minWidth: 10 } : {})}>
        <Text>x</Text>
      </Box>
      <Text>y</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  // With minWidth=10, x occupies 10 cols before y
  expect(lastFrame({ trimLines: true })).toBe("x         y");

  hasMin.value = false;
  await nextTick();
  // After reset, box shrinks to content; x and y are adjacent
  expect(lastFrame({ trimLines: true })).toBe("xy");
});

test("reset minHeight to 0 on removal (G19)", async () => {
  // minHeight=4 makes a column box at least 4 rows tall; removing should shrink to content.
  const hasMin = shallowRef(true);

  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column" {...(hasMin.value ? { minHeight: 4 } : {})}>
      <Text>x</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  // 4 rows: 'x' on first, 3 empty trailing
  expect(lastFrame({ trimLines: true })).toBe("x\n\n\n");

  hasMin.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("x");
});

test("reset gap to 0 on removal (G19)", async () => {
  // gap=2 in a column box adds 2 blank rows between children; removing should close the gap.
  const hasGap = shallowRef(true);

  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column" {...(hasGap.value ? { gap: 2 } : {})}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\nB");

  hasGap.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("A\nB");
});

test("reset flexGrow to 0 on removal (G19)", async () => {
  // flexGrow=1 makes the inner box expand to fill the row; removing it should shrink to content.
  const hasGrow = shallowRef(true);

  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="row" width={6}>
      <Box {...(hasGrow.value ? { flexGrow: 1 } : {})}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  // With flexGrow=1 the first box expands; A appears at the left, B at the right boundary
  expect(lastFrame({ trimLines: true })).toBe("A    B");

  hasGrow.value = false;
  await nextTick();
  // After reset, both items shrink to content
  expect(lastFrame({ trimLines: true })).toBe("AB");
});

test("reset flexBasis to auto on removal (G19)", async () => {
  // flexBasis="50%" fixes the inner box at 3 cells (50% of 6) so A pads to width 3
  // before B; removing flexBasis resets to auto, shrinking the box to content (1 cell).
  const hasBasis = shallowRef(true);

  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="row" width={6}>
      <Box {...(hasBasis.value ? { flexBasis: "50%" } : {})}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  // 50% of 6 = 3 cells → A occupies 3 cols before B
  expect(lastFrame({ trimLines: true })).toBe("A  B");

  hasBasis.value = false;
  await nextTick();
  // After reset to auto, box shrinks to content; A and B are adjacent
  expect(lastFrame({ trimLines: true })).toBe("AB");
});

test("reset justifyContent to flex-start on removal (G19)", async () => {
  // justifyContent=flex-end pushes 'x' to the end of a fixed-width row; removing resets to flex-start.
  const hasJustify = shallowRef(true);

  const Dynamic = defineComponent(() => () => (
    <Box
      flexDirection="row"
      width={4}
      {...(hasJustify.value ? { justifyContent: "flex-end" } : {})}
    >
      <Text>x</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("   x");

  hasJustify.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("x");
});

// Blocker 1: axis shorthands (marginX/Y, paddingX/Y) must map to the
// HORIZONTAL/VERTICAL yoga axes (like Ink), so they compose with the specific
// edges and removing the axis does not clobber a surviving specific edge.

test("removing marginX preserves a surviving marginLeft (Blocker 1)", async () => {
  // Both marginX=2 (horizontal axis) and marginLeft=5 (specific edge) set.
  // Per yoga precedence the specific EDGE_START wins on the left, EDGE_HORIZONTAL
  // governs the right. Removing marginX must reset only the axis and leave
  // marginLeft=5 intact (Vue does not re-emit the unchanged marginLeft).
  const hasAxis = shallowRef(true);

  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="row">
      <Box marginLeft={5} {...(hasAxis.value ? { marginX: 2 } : {})}>
        <Text>X</Text>
      </Box>
      <Text>Y</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  // marginLeft=5 (specific edge wins on left), marginX=2 on the right → 5 + X + 2 + Y
  expect(lastFrame({ trimLines: true })).toBe("     X  Y");

  hasAxis.value = false;
  await nextTick();
  // Axis reset to 0; surviving marginLeft=5 preserved, right margin gone → 5 + X + Y
  expect(lastFrame({ trimLines: true })).toBe("     XY");
});

test("removing paddingX preserves a surviving paddingLeft (Blocker 1)", async () => {
  const hasAxis = shallowRef(true);

  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="row">
      <Box paddingLeft={5} {...(hasAxis.value ? { paddingX: 2 } : {})}>
        <Text>X</Text>
      </Box>
      <Text>Y</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  // paddingLeft=5 on left, paddingX=2 on right → 5 + X + 2 + Y
  expect(lastFrame({ trimLines: true })).toBe("     X  Y");

  hasAxis.value = false;
  await nextTick();
  // Axis reset to 0; surviving paddingLeft=5 preserved → 5 + X + Y
  expect(lastFrame({ trimLines: true })).toBe("     XY");
});

test("marginX composes with marginLeft (specific edge wins) (Blocker 1)", async () => {
  // When both set, the specific edge (marginLeft=5) overrides the horizontal
  // axis (marginX=2) on the left; the axis still governs the right edge.
  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="row">
      <Box marginX={2} marginLeft={5}>
        <Text>X</Text>
      </Box>
      <Text>Y</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("     X  Y");
});

// Removing `display` resets to the DEFAULT (visible / DISPLAY_FLEX), not persist
// and not hide. This is a DELIBERATE divergence from Ink documented in
// .agents/docs/ink-divergences.md ("Removing `display` resets to the default"):
// Ink's applyDisplayStyles hides on a present-but-undefined `display` (and persists
// on omitted); vue-tui treats a removed prop as "back to the default" per the
// declarative contract (render = f(current props)) — same reasoning as the
// flexDirection/flexWrap reset (G19).

test("reset display=none to visible default on removal (display divergence)", async () => {
  // display="none" hides 'X'; removing the prop must reset to the default (visible),
  // NOT keep the stale DISPLAY_NONE (the bug) and NOT hide (Ink's behavior).
  const hidden = shallowRef(true);

  const Dynamic = defineComponent(() => () => (
    <Box {...(hidden.value ? { display: "none" } : {})}>
      <Text>X</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  // While display="none" is set, the box and its text are hidden.
  expect(lastFrame({ trimLines: true })).toBe("");

  hidden.value = false;
  await nextTick();
  // After removal, display resets to the default (DISPLAY_FLEX) → 'X' is visible.
  expect(lastFrame({ trimLines: true })).toBe("X");
});

test("display=flex removed stays visible (default unchanged) (display divergence)", async () => {
  // An explicit display="flex" is already the default; removing it must leave the
  // box visible (default), confirming removal lands on the default both ways.
  const explicit = shallowRef(true);

  const Dynamic = defineComponent(() => () => (
    <Box {...(explicit.value ? { display: "flex" } : {})}>
      <Text>X</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("X");

  explicit.value = false;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("X");
});

test("explicit display=none still hides while set (display divergence control)", async () => {
  // Control: an explicitly-set display="none" must still hide — the reset only
  // fires on REMOVAL, never while the prop holds the value "none".
  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column">
      <Box display="none">
        <Text>hidden</Text>
      </Box>
      <Text>shown</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  expect(lastFrame({ trimLines: true })).toBe("shown");
});

test("reset position to relative on removal (G19)", async () => {
  // position=absolute with offsets removes the box from flow and moves it visually;
  // removing 'position' should restore relative positioning (back in flow at top).
  const hasAbsolute = shallowRef(true);

  const Dynamic = defineComponent(() => () => (
    <Box flexDirection="column" width={4} height={3}>
      <Box {...(hasAbsolute.value ? { position: "absolute", top: 2 } : {})}>
        <Text>A</Text>
      </Box>
      <Text>B</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 100 });
  // With position=absolute + top=2, A is out-of-flow at row 2; B fills row 0
  expect(lastFrame({ trimLines: true })).toBe("B\n\nA");

  hasAbsolute.value = false;
  await nextTick();
  // After reset to relative (position prop removed), A re-enters flow above B
  expect(lastFrame({ trimLines: true })).toBe("A\nB\n");
});
