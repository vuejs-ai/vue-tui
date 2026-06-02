import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("gap", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" gap={1} width={3} flexWrap="wrap">
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A B\n\nC");
});

test("column gap", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" gap={1}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A B");
});

test("row gap", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" gap={1}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A\n\nB");
});

// --- dedicated columnGap / rowGap props (B30, distinct from the `gap` shorthand) ---
//
// Ink semantics (styles.ts applyGapStyles): `columnGap` → yoga GUTTER_COLUMN
// (the gap BETWEEN columns, i.e. horizontal spacing, which is the MAIN-axis gap
// in flexDirection:"row"); `rowGap` → yoga GUTTER_ROW (the gap BETWEEN rows, i.e.
// vertical spacing, the main-axis gap in flexDirection:"column"). vue-tui maps the
// same way (host/yoga.ts: columnGap→GUTTER_COLUMN, rowGap→GUTTER_ROW).
//
// Confirmed against the pinned Ink reference (v7.0.4, /tmp/ink-40b3a75/build,
// renderToString cols=100):
//   row    + columnGap:2 → "A  B"
//   column + rowGap:2    → "A\n\n\nB"
//   row wrap + columnGap:1 width:3 → "A B\nC"
//   row    + rowGap:2    → "AB"   (cross-axis only; no main-axis effect)
//   column + columnGap:2 → "A\nB" (cross-axis only; no main-axis effect)

test("columnGap is the main-axis (horizontal) gap in flexDirection:row", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" columnGap={2}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Two spaces between the columns — matches Ink "A  B".
  expect(lastFrame({ trimLines: true })).toBe("A  B");
});

test("rowGap is the main-axis (vertical) gap in flexDirection:column", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" rowGap={2}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Two blank rows between A and B — matches Ink "A\n\n\nB".
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\nB");
});

test("columnGap spaces wrapped columns horizontally (row + flexWrap)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" columnGap={1} width={3} flexWrap="wrap">
        <Text>A</Text>
        <Text>B</Text>
        <Text>C</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // "A" and "B" share the first row with a 1-col gap; "C" wraps. Matches Ink "A B\nC".
  expect(lastFrame({ trimLines: true })).toBe("A B\nC");
});

test("rowGap has no main-axis effect in flexDirection:row (cross-axis only)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" rowGap={2}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // rowGap is the BETWEEN-ROWS gap; a single-row layout has no rows to separate,
  // so it adds nothing. Matches Ink "AB".
  expect(lastFrame({ trimLines: true })).toBe("AB");
});

test("columnGap has no main-axis effect in flexDirection:column (cross-axis only)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" columnGap={2}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // columnGap is the BETWEEN-COLUMNS gap; a single-column layout has no columns to
  // separate, so it adds nothing. Matches Ink "A\nB".
  expect(lastFrame({ trimLines: true })).toBe("A\nB");
});

// Prop-reset: removing columnGap (undefined) or setting it to 0 must collapse the
// horizontal spacing back to the no-gap baseline. yoga.ts resets the gutter to 0
// when the prop is null/undefined (G19), so the layout must re-flow tight.
test("columnGap resets when removed (undefined) or set to 0", async () => {
  const gap = shallowRef<number | undefined>(2);
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" columnGap={gap.value}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A  B");

  // Remove the prop entirely → gutter resets to 0, columns abut.
  gap.value = undefined;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("AB");

  // Re-apply, then explicitly set 0 → also tight.
  gap.value = 3;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("A   B");
  gap.value = 0;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("AB");
});

// Prop-reset for rowGap in the vertical direction.
test("rowGap resets when removed (undefined) or set to 0", async () => {
  const gap = shallowRef<number | undefined>(2);
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" rowGap={gap.value}>
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\nB");

  gap.value = undefined;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("A\nB");

  gap.value = 0;
  await nextTick();
  expect(lastFrame({ trimLines: true })).toBe("A\nB");
});

// Skipped: gap - concurrent
// Skipped: column gap - concurrent
// Skipped: row gap - concurrent
