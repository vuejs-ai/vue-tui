import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("grow equally", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexGrow={1}>
          <Text>A</Text>
        </Box>
        <Box flexGrow={1}>
          <Text>B</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A  B");
});

test("grow one element", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexGrow={1}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A    B");
});

test("do not shrink", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={16}>
        <Box flexShrink={0} width={6}>
          <Text>A</Text>
        </Box>
        <Box flexShrink={0} width={6}>
          <Text>B</Text>
        </Box>
        <Box width={6}>
          <Text>C</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A     B     C");
});

test("shrink equally", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={10}>
        <Box flexShrink={1} width={6}>
          <Text>A</Text>
        </Box>
        <Box flexShrink={1} width={6}>
          <Text>B</Text>
        </Box>
        <Text>C</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A    B   C");
});

test('set flex basis with flexDirection="row" container', async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexBasis={3}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A  B");
});

test('set flex basis in percent with flexDirection="row" container', async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexBasis="50%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A  B");
});

test('set flex basis with flexDirection="column" container', async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={6} flexDirection="column">
        <Box flexBasis={3}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\nB\n\n");
});

test('set flex basis in percent with flexDirection="column" container', async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={6} flexDirection="column">
        <Box flexBasis="50%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A\n\n\nB\n\n");
});

// Ink coerces ANY string flexBasis to a percent (styles.ts:547-555): a bare
// numeric string like "3" is parsed as 3% of the container, NOT 3 absolute
// cells. At width 6, "3" → 3% → 0 cells, so box A collapses and B takes the row.
test("bare numeric-string flexBasis is a percent (Ink parity), not absolute", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexBasis="3">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // 3% of 6 = 0 cells → A width 0 → only B is rendered.
  expect(lastFrame({ trimLines: true })).toBe("B");
});

// Guard: a "50%" string still resolves to 50% (3 cells of 6) → "A  B".
test('percent-string flexBasis "50%" still resolves as percent', async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexBasis="50%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A  B");
});

// Guard: a numeric flexBasis stays absolute (3 cells) → "A  B".
test("numeric flexBasis stays absolute", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexBasis={3}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("A  B");
});

// Ink's flexBasis branch (styles.ts:547-555) is number→setFlexBasis,
// string→setFlexBasisPercent, ELSE→setFlexBasisAuto. A non-number/non-string
// runtime value (Vue's [Number,String] prop validation only WARNS — it still
// forwards the value) must fall back to auto, not throw. Ink renders "AB"
// (flexBasis ignored → box shrinks to content). flexBasis={false} is the
// canonical case; the cast bypasses the compile-time prop type to exercise the
// real runtime branch a mis-typed app would hit.
test("non-number/non-string flexBasis falls back to auto (Ink parity), does not throw", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexBasis={false as unknown as number}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Auto fallback → box shrinks to content → A and B adjacent, matching Ink.
  expect(lastFrame({ trimLines: true })).toBe("AB");
});

// PRE-EXISTING DOWNSTREAM DIVERGENCE — out of scope for the string→percent setter.
// A zero/negative parsed percent ("0"→0%, "-5"→-5%, "0x10"→parseInt=0→0%) produces
// a 0-width inner box. Ink renders "B\nA" (B on the row, A wraps onto the next line);
// vue renders "B" (A dropped). EVIDENCE: with width=6 and this exact tree, the frame is
//   input    vue-OLD (setFlexBasis(string))   vue-NEW (setFlexBasisPercent)   Ink v7.0.4
//   "0"      "B"                              "B"                             "B\nA"
//   "-5"     "B"                              "B"                             "B\nA"
//   "0x10"   "B"                              "B"                             "B\nA"
// vue-OLD already differed from Ink here, so this PR's setter change neither caused nor
// fixed it — the two setters yield byte-identical yoga COMPUTED layout for these inputs;
// the "B" vs "B\nA" gap is a separate downstream paint/wrap divergence. Skipped (not
// xfail-asserted as "B") so we don't lock vue's current behavior as correct: the target
// is Ink's "B\nA". Tracked separately from the flexBasis-percent setter work.
test.skip("zero/negative flexBasis% wraps the sibling in Ink (downstream divergence)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box flexBasis="0">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Ink v7.0.4 renders "B\nA"; vue currently renders "B" (see comment above).
  expect(lastFrame({ trimLines: true })).toBe("B\nA");
});
