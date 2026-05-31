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

// A zero/negative parsed percent ("0"→0%, "-5"→-5%, "0x10"→parseInt=0→0%) produces a
// 0-width inner box. Ink renders "B\nA" (B on the row, A wraps onto the next line). The
// 0-width text measures via wrapAnsi("A", 0, {hard:true, trim:false}) = "\nA" → height 2,
// so A occupies a second row. vue previously dropped the text ("B") because wrapText's
// `width <= 0 → [""]` guard collapsed the measure to height 1. Verified against Ink v7.0.4
// (@40b3a75): all four of flexBasis=0/"0%" and width=0/"0%" render "B\nA".
test("zero/negative flexBasis% wraps the sibling in Ink (downstream divergence)", async () => {
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
  // Ink v7.0.4 renders "B\nA".
  expect(lastFrame({ trimLines: true })).toBe("B\nA");
});

test("zero-width Box wraps its text onto its own line (width={0})", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6}>
        <Box width={0}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Ink v7.0.4 renders "B\nA": the 0-width text measures height 2 via
  // wrapAnsi("A", 0, {hard:true}) = "\nA", so A wraps below sibling B.
  expect(lastFrame({ trimLines: true })).toBe("B\nA");
});

test('zero-percent-width Box wraps its text onto its own line (width="0%")', async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6}>
        <Box width="0%">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Ink v7.0.4 renders "B\nA" — same as width={0}; a 0% resolved width is also 0px.
  expect(lastFrame({ trimLines: true })).toBe("B\nA");
});

test("zero-width Box with EMPTY text adds no spurious row", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6}>
        <Box width={0}>
          <Text>{""}</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Ink v7.0.4 renders "B": empty text measures width 0 (≤ 0), so it never wraps and
  // never gains a second row. The 0-width fix must NOT add a blank row here.
  expect(lastFrame({ trimLines: true })).toBe("B");
});

test("zero-width Box with backgroundColor wraps cleanly, keeping the bg glyph (Ink parity)", async () => {
  // Regression guard for the wrap-ansi width<=0 byte-split: at width 0 the 0-width Box's
  // text wraps onto its own row, but vue bakes the bg color INTO the string before wrapping,
  // and wrap-ansi@10 byte-splits the SGR escapes of a STYLED string at width<=0
  // (wrapAnsi("\x1b[41mA\x1b[49m", 0) = "\x1b\n[\n4\n1\nm\nA\n…"). That scattered the escape
  // bytes across rows and rendered a garbage "B\n[" (the 2nd byte of "\x1b[41m"). wrapText
  // now routes width<=0 styled text through an ANSI-aware per-grapheme split, matching Ink,
  // which wraps PLAIN text and colorizes per line afterwards.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" width={6}>
        <Box width={0} backgroundColor="red">
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // RAW-byte parity target captured from Ink v7.0.4 (@40b3a75) with chalk level 3:
  // "B\n\x1b[41mA\x1b[49m\n" — row 2 keeps the FULL bg-colored glyph (overflow:visible).
  // vue trims trailing whitespace/newlines per frame line, so the equivalent raw frame is
  // "B\n\x1b[41mA\x1b[49m" (no trailing newline). The bg glyph must survive intact.
  expect(lastFrame({ raw: true })).toBe("B\n\x1b[41mA\x1b[49m");
  // And the stripped visible layout is "B\nA" (sanity check on the wrap position).
  // eslint-disable-next-line no-control-regex -- strip ANSI to assert the visible layout
  const visible = lastFrame({ trimLines: true })!.replace(/\x1b\[[0-9;]*m/g, "");
  expect(visible).toBe("B\nA");
});
