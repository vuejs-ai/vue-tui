import { defineComponent, shallowRef, nextTick, h } from "vue";
import { test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, renderToString } from "@vue-tui/runtime";

const BG_BLUE = "\x1b[44m";
const BG_CYAN = "\x1b[46m";

// Ink parity (render-border.ts:35-52): a border edge's background comes only from
// border<Edge>BackgroundColor ?? borderBackgroundColor — it never falls back to the
// Box's own backgroundColor. So a Box with backgroundColor but no explicit border
// background must draw plain (uncolored-bg) border glyphs; the bg fills the inner
// content area only.
test("Box backgroundColor does not bleed onto border glyphs (Ink parity)", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="cyan" borderStyle="round" width={10} height={5} alignSelf="flex-start">
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const lines = lastFrame()!.split("\n");
  // Top and bottom border rows carry no background.
  expect(lines[0]).not.toContain(BG_CYAN);
  expect(lines.at(-1)).not.toContain(BG_CYAN);
  // Inner content rows still get the background fill.
  expect(lines[1]).toContain(BG_CYAN);
});

test("Box backgroundColor produces ANSI background codes", async ({ expect }) => {
  const { frames } = await render(() => <Box backgroundColor="blue" width={5} height={1} />, {
    columns: 10,
  });
  expect(frames.at(-1)).toContain(BG_BLUE);
});

test("Box backgroundColor survives border rendering", async ({ expect }) => {
  const { frames } = await render(
    () => <Box backgroundColor="blue" borderStyle="single" width={6} height={3} />,
    { columns: 10 },
  );
  const raw = frames.at(-1)!;
  expect(raw).toContain(BG_BLUE);
  expect(raw).toContain("┌");
});

test("child Text inherits backgroundColor from parent Box", async ({ expect }) => {
  const { frames } = await render(
    () => (
      <Box backgroundColor="blue" width={10} height={1}>
        <Text>hello</Text>
      </Box>
    ),
    { columns: 20 },
  );
  const raw = frames.at(-1)!;
  expect(raw).toContain("hello");
  expect(raw).toContain(BG_BLUE);
});

test("wrapped text preserves backgroundColor on every content line", async ({ expect }) => {
  const { frames } = await render(
    () => (
      <Box backgroundColor="blue" borderStyle="single" width={10} height={5}>
        <Text>long text here</Text>
      </Box>
    ),
    { columns: 20 },
  );
  const raw = frames.at(-1)!;
  const lines = raw.split("\n").filter(Boolean);
  // Ink parity: the inner content rows carry the background on every line; the
  // first/last rows are pure border glyphs and carry no background.
  const contentLines = lines.slice(1, -1);
  expect(contentLines.length).toBeGreaterThan(0);
  for (const line of contentLines) {
    expect(line).toContain(BG_BLUE);
  }
  expect(lines[0]).not.toContain(BG_BLUE);
  expect(lines.at(-1)).not.toContain(BG_BLUE);
});

// --- Ink background tests ---

test("Text inherits parent Box background color", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="green" alignSelf="flex-start">
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[42mHello World[49m"`);
});

test("Text explicit background color overrides inherited", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" alignSelf="flex-start">
        <Text backgroundColor="blue">Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[44mHello World[49m"`);
});

test("Nested Box background inheritance", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" alignSelf="flex-start">
        <Box backgroundColor="blue">
          <Text>Hello World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[44mHello World[49m"`);
});

// Ink parity (Box.tsx:103 truthy provide-guard + render-background.ts:11 falsy
// fill-guard): an inner <Box backgroundColor=""> does NOT override the ancestor's
// backgroundContext (the `if (backgroundColor)` guard is falsy for ""), so its
// descendants keep inheriting the ancestor's bg — while the empty-bg Box itself
// paints NO fill. The fill var and the value threaded to children must be SPLIT.
test("inner Box backgroundColor='' keeps inheriting ancestor Box background", async ({
  expect,
}) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" alignSelf="flex-start">
        <Box backgroundColor="">
          <Text>Hello World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  // Inner text still renders on the inherited RED (41) bg, not bare.
  expect(lastFrame()).toMatchInlineSnapshot(`"[41mHello World[49m"`);
});

test("two-level-deep empty-bg Boxes still inherit ancestor Box background", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" alignSelf="flex-start">
        <Box backgroundColor="">
          <Box backgroundColor="">
            <Text>Hello World</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[41mHello World[49m"`);
});

// Locks the case a single-variable fix would break. A SIZED/BORDERED inner
// empty-bg Box must add NO own fill inside its border (Ink render-background.ts:11
// skips fill when style.backgroundColor is falsy), yet its descendants still
// inherit the ancestor's bg. We make the outer green box SHORTER (height 2) than
// the inner box (height 4): the outer's green fill backs the inner's first
// content row but NOT its second. The discriminator is that second inner content
// row — with the correct split it stays BARE (the inner Box emits no fill of its
// own), exactly matching Ink; a single-variable fix would emit an inner green fill
// across every content row, painting that row green. Byte-for-byte parity with
// real Ink v7.0.4 (40b3a75) rendering this exact tree.
test("sized/bordered inner empty-bg Box adds no own fill but text still inherits", async ({
  expect,
}) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignSelf="flex-start" height={6}>
        <Box backgroundColor="green" width={14} height={2}>
          <Box backgroundColor="" borderStyle="single" width={10} height={4}>
            <Text>Hi</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  // Row 0: inner top border, then the outer's green fill in the 4 cells right of it.
  // Row 1: "Hi" + inherited-green text fill inside the border; outer green right.
  // Row 2: inner's SECOND content row — BARE (no [42m); outer is only 2 tall, and
  //        the empty-bg inner Box paints nothing of its own.
  // Row 3: inner bottom border.
  expect(lastFrame()).toMatchInlineSnapshot(`
    "┌────────┐[42m    [49m
    │[42mHi      [49m│[42m    [49m
    │        │
    └────────┘"
  `);
});

test("Text without parent Box background has no inheritance", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box alignSelf="flex-start">
        <Text>Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello World");
});

test("Multiple Text elements inherit same background", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="yellow" alignSelf="flex-start">
        <Text>Hello </Text>
        <Text>World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[43mHello World[49m"`);
});

// Ink parity (Text.tsx:103-106): a child <Text>'s effective background is
// `backgroundColor ?? inheritedBackgroundColor`, and the bg wrap is applied only
// when that value is truthy. An explicit `backgroundColor=""` is NOT undefined,
// so it does NOT inherit — it resolves to `""` (falsy) and OPTS OUT of the
// inherited Box background, rendering the glyphs with no bg.
test("Text backgroundColor='' opts out of inherited Box background", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="green" alignSelf="flex-start">
        <Text backgroundColor="">No BG</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Bare text, no green (42) bleed and no bg reset (49) at all.
  expect(lastFrame()).toBe("No BG");
});

test("Mixed text with and without background inheritance", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="green" alignSelf="flex-start">
        <Text>Inherited </Text>
        <Text backgroundColor="">No BG </Text>
        <Text backgroundColor="red">Red BG</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Matches Ink background.tsx:106-116: bgGreen('Inherited ') + 'No BG ' + bgRed('Red BG').
  // The "" Text opts out, so green is reset (49) before "No BG " and it renders bare.
  expect(lastFrame()).toMatchInlineSnapshot(`"[42mInherited [49mNo BG [41mRed BG[49m"`);
});

test("Complex nested structure with background inheritance", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="yellow" alignSelf="flex-start">
        <Box>
          <Text>Outer: </Text>
          <Box backgroundColor="blue">
            <Text>Inner: </Text>
            <Text backgroundColor="red">Explicit</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[43mOuter: [44mInner: [41mExplicit[49m"`);
});

test("Box background with standard color", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[41mHello[49m"`);
});

test("Box background with hex color", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="#FF0000" alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[48;2;255;0;0mHello[49m"`);
});

test("Box background with rgb color", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="rgb(255, 0, 0)" alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[48;2;255;0;0mHello[49m"`);
});

test("Box background with ansi256 color", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="ansi256(9)" alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[48;5;9mHello[49m"`);
});

test("Box background with wide characters", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="yellow" alignSelf="flex-start">
        <Text>こんにちは</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[43mこんにちは[49m"`);
});

test("Box background with emojis", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" alignSelf="flex-start">
        <Text>🎉🎊</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`"[41m🎉🎊[49m"`);
});

test("Box background fills entire area with standard color", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" width={10} height={3} alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[41mHello     [49m
    [41m          [49m
    [41m          [49m"
  `);
});

test("Box background fills with hex color", async ({ expect }) => {
  const bgHexRed = "[48;2;255;0;0m";
  const bgReset = "[49m";

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="#FF0000" width={10} height={3} alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  expect(output).toContain("Hello");
  expect(output).toContain(bgHexRed);
  expect(output).toContain(bgReset);
});

test("Box background fills with rgb color", async ({ expect }) => {
  const bgHexRed = "[48;2;255;0;0m";
  const bgReset = "[49m";

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="rgb(255, 0, 0)" width={10} height={3} alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  expect(output).toContain("Hello");
  expect(output).toContain(bgHexRed);
  expect(output).toContain(bgReset);
});

test("Box background fills with ansi256 color", async ({ expect }) => {
  const bgAnsi256Nine = "[48;5;9m";
  const bgReset = "[49m";

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="ansi256(9)" width={10} height={3} alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  expect(output).toContain("Hello");
  expect(output).toContain(bgAnsi256Nine);
  expect(output).toContain(bgReset);
});

test("Box background with border fills content area", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="cyan" borderStyle="round" width={10} height={5} alignSelf="flex-start">
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "╭────────╮
    │[46mHi      [49m│
    │[46m        [49m│
    │[46m        [49m│
    ╰────────╯"
  `);
});

test("Box background with padding fills entire padded area", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="magenta" padding={1} width={10} height={5} alignSelf="flex-start">
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[45m          [49m
    [45m Hi       [49m
    [45m          [49m
    [45m          [49m
    [45m          [49m"
  `);
});

test("Box background with center alignment fills entire area", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        backgroundColor="blue"
        width={10}
        height={3}
        justifyContent="center"
        alignSelf="flex-start"
      >
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[44m    Hi    [49m
    [44m          [49m
    [44m          [49m"
  `);
});

test("Box background with column layout fills entire area", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        backgroundColor="green"
        flexDirection="column"
        width={10}
        height={5}
        alignSelf="flex-start"
      >
        <Text>Line 1</Text>
        <Text>Line 2</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[42mLine 1    [49m
    [42mLine 2    [49m
    [42m          [49m
    [42m          [49m
    [42m          [49m"
  `);
});

test("Box background updates on rerender", async ({ expect }) => {
  const bgColor = shallowRef<string | undefined>(undefined);

  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor={bgColor.value} alignSelf="flex-start">
        <Text>Hello</Text>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame()).toBe("Hello");

  bgColor.value = "green";
  await nextTick();
  expect(lastFrame()).toMatchInlineSnapshot(`"[42mHello[49m"`);

  bgColor.value = undefined;
  await nextTick();
  expect(lastFrame()).toBe("Hello");
});

test("Box backgroundColor fills full width on every line when text wraps", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="red" width={10} alignSelf="flex-start">
        <Text>Hello World!!</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[41mHello     [49m
    [41mWorld!!   [49m"
  `);
});

test("Text-only backgroundColor colors text content but does not fill Box width", async ({
  expect,
}) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={10} alignSelf="flex-start">
        <Text backgroundColor="red">Hello World!!</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toMatchInlineSnapshot(`
    "[41mHello [49m
    [41mWorld!![49m"
  `);
});

// --- Ink border-backgrounds tests ---

test("border with background color", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="single" borderColor="white" borderBackgroundColor="blue">
        <Box width={4}>
          <Text>Test</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  expect(output).toContain("┌");
  expect(output).toContain("┐");
  expect(output).toContain("└");
  expect(output).toContain("┘");
  expect(output).toContain("Test");
  // Named blue background => ESC[44m
  expect(output).toContain("[44m");
});

test("border with different background colors per side", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        borderStyle="single"
        borderTopBackgroundColor="red"
        borderBottomBackgroundColor="blue"
        borderLeftBackgroundColor="green"
        borderRightBackgroundColor="yellow"
      >
        <Box width={4}>
          <Text>Test</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  expect(output).toContain("┌");
  expect(output).toContain("┐");
  expect(output).toContain("└");
  expect(output).toContain("┘");
  expect(output).toContain("Test");
  // red => 41, green => 42, yellow => 43, blue => 44
  expect(output).toContain("[41m");
  expect(output).toContain("[42m");
  expect(output).toContain("[43m");
  expect(output).toContain("[44m");
});

test("border background color fallback to general borderBackgroundColor", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="single" borderBackgroundColor="magenta" borderTopBackgroundColor="cyan">
        <Box width={4}>
          <Text>Test</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  expect(output).toContain("┌");
  expect(output).toContain("┐");
  expect(output).toContain("└");
  expect(output).toContain("┘");
  expect(output).toContain("Test");
  // cyan => 46, magenta => 45
  expect(output).toContain("[46m");
  expect(output).toContain("[45m");
});

test("vertical border background does not bleed into content rows", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderStyle="classic" borderBackgroundColor="cyan" alignSelf="flex-start" width={12}>
        <Text>Text longer than the Box width, so will definitely wrap.</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  const bgCyanPattern = "\\[46m";
  const bgResetPattern = "\\[49m";
  const tableBorderChar = "|";
  const tableBorderPattern = bgCyanPattern + tableBorderChar + bgResetPattern;
  const contentRowPattern = new RegExp(`^${tableBorderPattern}.*${tableBorderPattern}$`);

  const tableRows = output.split("\n");
  const contentRows = tableRows.slice(1, -1);
  for (const contentRow of contentRows) {
    expect(contentRow).toMatch(contentRowPattern);
  }
});

test("foreground, background and dim combine correctly", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        borderTopDimColor
        borderStyle="single"
        borderTopColor="red"
        borderTopBackgroundColor="cyan"
        alignSelf="flex-start"
      >
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const output = lastFrame()!;
  // EXACT-byte parity with Ink's render-border.ts stylePiece (commit 40b3a75,
  // lines 7-20): fg innermost, then bg, then dim outermost. Open codes nest
  // dim(2) -> bg(46) -> fg(31); close fg(39) -> bg(49) -> dim(22). The lax
  // `.toContain('[31m')` form this replaces would pass even with the wrong
  // Text-style (dim-innermost) nesting.
  const topLine = output.split("\n")[0]!;
  expect(topLine).toContain("\x1b[2m\x1b[46m\x1b[31m");
  expect(topLine).toContain("\x1b[39m\x1b[49m\x1b[22m");
});

// --- A12: chalk-modifier-name backgroundColor aligns to Ink's throw ---
//
// Ink colorize.ts (commit 40b3a75): for a BACKGROUND, `isNamedColor(color)`
// (`color in chalk`) is true for a chalk MODIFIER name ("bold","dim","italic",
// "underline","inverse","hidden","strikethrough",…), so it builds
// methodName = `bg${Capitalize(color)}` and calls `chalk[methodName]` — which is
// undefined for a modifier (chalk has no `bgBold`/`bgDim`/…) — and THROWS
// "chalk.bgBold is not a function". A chalk COLOR name resolves to a real `bg*`
// method and works; a string NOT in chalk falls through to bare text (no throw);
// foreground `color="bold"` resolves `chalk.bold` (a real fn) and bolds (no throw).
// border<Edge>BackgroundColor route through the same colorize('background') in
// render-border.ts stylePiece, so Ink throws there too. vue-tui must validate
// during component RENDER (so the throw lands in the error boundary, not the
// post-flush paint where it would wedge Vue's scheduler — cf. the borderStyle fix #124).

const BG_MODIFIER_NAMES = [
  "bold",
  "dim",
  "italic",
  "underline",
  "inverse",
  "hidden",
  "strikethrough",
  "reset",
  "overline",
] as const;

for (const modifier of BG_MODIFIER_NAMES) {
  test(`<Box backgroundColor="${modifier}"> (chalk modifier name) throws (Ink parity)`, async ({
    expect,
  }) => {
    await expect(
      render(
        defineComponent(() => () => (
          <Box backgroundColor={modifier} alignSelf="flex-start">
            <Text>Hi</Text>
          </Box>
        )),
        { columns: 100 },
      ),
    ).rejects.toThrow(/backgroundColor/i);
  });

  test(`<Text backgroundColor="${modifier}"> (chalk modifier name) throws (Ink parity)`, async ({
    expect,
  }) => {
    await expect(
      render(
        defineComponent(() => () => <Text backgroundColor={modifier}>Hi</Text>),
        { columns: 100 },
      ),
    ).rejects.toThrow(/backgroundColor/i);
  });

  test(`<Box borderBackgroundColor="${modifier}"> (chalk modifier name) throws (Ink parity)`, async ({
    expect,
  }) => {
    await expect(
      render(
        defineComponent(() => () => (
          <Box borderStyle="single" borderBackgroundColor={modifier} alignSelf="flex-start">
            <Text>Hi</Text>
          </Box>
        )),
        { columns: 100 },
      ),
    ).rejects.toThrow(/backgroundColor/i);
  });
}

// Per-edge border backgrounds route through the same colorize('background') in
// Ink's render-border.ts stylePiece, so a modifier name on any edge throws too.
for (const edgeProp of [
  "borderTopBackgroundColor",
  "borderBottomBackgroundColor",
  "borderLeftBackgroundColor",
  "borderRightBackgroundColor",
] as const) {
  test(`<Box ${edgeProp}="dim"> (chalk modifier name) throws (Ink parity)`, async ({ expect }) => {
    await expect(
      render(
        defineComponent(() => () => (
          <Box borderStyle="single" {...{ [edgeProp]: "dim" }} alignSelf="flex-start">
            <Text>Hi</Text>
          </Box>
        )),
        { columns: 100 },
      ),
    ).rejects.toThrow(/backgroundColor/i);
  });
}

// MUST NOT throw: a chalk COLOR name has a real `bg*` method and works.
test("backgroundColor of a real color name (a bg* method exists) does NOT throw", async ({
  expect,
}) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="blackBright" alignSelf="flex-start">
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toContain("Hi");
});

// MUST NOT throw: a string NOT in chalk falls through to bare text in Ink (no
// throw). vue-tui keeps that degrade — only the in-chalk modifier names throw.
test("backgroundColor of an unknown non-chalk string degrades to bare text (no throw)", async ({
  expect,
}) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box backgroundColor="not-a-real-color" alignSelf="flex-start">
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // No SGR background codes, just bare text.
  expect(lastFrame()).toBe("Hi");
});

test("non-string host Box backgroundColor does not override inherited background", async ({
  expect,
}) => {
  const { lastFrame } = await render(
    defineComponent(
      () => () =>
        h("box", { backgroundColor: "red", width: 5, height: 2 }, [
          h("box", { backgroundColor: [0, 0, 255], width: 5, height: 2 }, [h("text", null, "Hi")]),
        ]),
    ),
    { columns: 100 },
  );

  expect(lastFrame()).toMatchInlineSnapshot(`
    "[41mHi   [49m
    [41m     [49m"
  `);
});

test("non-string host Text backgroundColor does not override inherited background", async ({
  expect,
}) => {
  const { lastFrame } = await render(
    defineComponent(
      () => () =>
        h("box", { backgroundColor: "red", alignSelf: "flex-start" }, [
          h("text", { backgroundColor: [0, 0, 255] }, "Hi"),
        ]),
    ),
    { columns: 100 },
  );

  expect(lastFrame()).toMatchInlineSnapshot(`"[41mHi[49m"`);
});

// MUST NOT throw: hex / ansi256 / rgb(...) string backgrounds are valid Ink forms.
test("backgroundColor hex / ansi256 / rgb string do NOT throw", async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" alignSelf="flex-start">
        <Box backgroundColor="#00ff00">
          <Text>A</Text>
        </Box>
        <Box backgroundColor="ansi256(9)">
          <Text>B</Text>
        </Box>
        <Box backgroundColor="rgb(1, 2, 3)">
          <Text>C</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  const out = lastFrame()!;
  expect(out).toContain("A");
  expect(out).toContain("C");
});

// MUST NOT throw: foreground `color="bold"` resolves `chalk.bold` (a real fn) and
// applies the modifier — Ink works here (no throw), and vue-tui must match.
test('foreground color="bold" (a chalk modifier) bolds, does NOT throw', async ({ expect }) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box alignSelf="flex-start">
        <Text color="bold">Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // chalk.bold => ESC[1m … ESC[22m
  expect(lastFrame()).toContain("\x1b[1m");
});

// --- A12 gating: vue must throw WHERE Ink colorizes, and NOT elsewhere ---
//
// Ink throws on a chalk-modifier-name bg LAZILY — only when it actually
// colorizes a rendered piece (render-border.ts gates on `borderStyle` truthy +
// the edge being DRAWN and uses `border<Edge>BackgroundColor ?? borderBackgroundColor`;
// render-background/Text skip empty/hidden nodes). vue-tui's component-render
// validation must mirror those gates, or it OVER-THROWS where Ink renders fine.
// These pin the now-correct NON-throwing cases (RED before the gating fix).

// No borderStyle → render-border.ts:28 gate is false → no border colorize at all.
// So a modifier-name borderBackgroundColor with NO borderStyle must NOT throw.
test("borderBackgroundColor modifier name with NO borderStyle does NOT throw (Ink: gate off)", async ({
  expect,
}) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box borderBackgroundColor="bold" alignSelf="flex-start">
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // No border is drawn (no borderStyle); the bg is never colorized.
  expect(lastFrame()).toContain("Hi");
});

// A per-edge modifier-name bg on a DISABLED edge must NOT throw: Ink only
// colorizes the edge when it is drawn (`border<Edge> !== false`). Here the top
// edge is disabled, so its bg never reaches colorize.
test("borderTopBackgroundColor modifier name on a DISABLED top edge does NOT throw (Ink: edge not drawn)", async ({
  expect,
}) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        borderStyle="single"
        borderTop={false}
        borderTopBackgroundColor="bold"
        alignSelf="flex-start"
        width={8}
        height={3}
      >
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Top edge not drawn → its modifier-name bg never colorized → no throw.
  expect(lastFrame()).toContain("Hi");
});

// A bad GENERAL borderBackgroundColor is harmless if every DRAWN edge overrides
// it with a valid per-edge value: in Ink the general value is only the fallback
// (`border<Edge>BackgroundColor ?? borderBackgroundColor`), so when all four
// edges supply a valid override the general value never reaches colorize.
test("bad general borderBackgroundColor with valid per-edge on every drawn edge does NOT throw", async ({
  expect,
}) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box
        borderStyle="single"
        borderBackgroundColor="bold"
        borderTopBackgroundColor="blue"
        borderBottomBackgroundColor="blue"
        borderLeftBackgroundColor="blue"
        borderRightBackgroundColor="blue"
        alignSelf="flex-start"
        width={8}
        height={3}
      >
        <Text>Hi</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Every drawn edge resolves to a valid "blue"; the bad general value is never used.
  expect(lastFrame()).toContain("Hi");
});

test("non-string border edge background does not suppress invalid general fallback", async ({
  expect,
}) => {
  // Deliberately bypass the public string type to exercise runtime JS input.
  const legacyTuple = [0, 0, 255] as unknown as string;

  await expect(
    render(
      defineComponent(
        () => () =>
          h(Box, {
            borderStyle: "single",
            borderBackgroundColor: "bold",
            borderTopBackgroundColor: legacyTuple,
            borderBottom: false,
            borderLeft: false,
            borderRight: false,
            width: 4,
            height: 1,
          }),
      ),
      { columns: 100 },
    ),
  ).rejects.toThrow(/borderTopBackgroundColor/i);
});

// Empty <Text backgroundColor="bold">{""}</Text>: Ink's Text returns null for
// empty children BEFORE attaching its colorizing transform, so colorize never
// runs. vue-tui validates AFTER the empty early-return, so this must NOT throw.
test('empty <Text backgroundColor="bold">{""}</Text> does NOT throw (Ink: returns null first)', async ({
  expect,
}) => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box alignSelf="flex-start">
        <Text backgroundColor="bold">{""}</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Empty text renders nothing and never colorizes.
  expect(lastFrame()).toBe("");
});

// A screen-reader-hidden <Box> / <Text> with a modifier-name bg must NOT throw:
// Ink emits no node for an aria-hidden element under a screen reader, so it
// never colorizes. vue-tui validates AFTER the screen-reader-hidden early-return.
// Uses renderToString (which supports isScreenReaderEnabled) — a throw during
// render would propagate out of renderToString, so `not.toThrow` pins the fix.
test("screen-reader-hidden Box with modifier-name backgroundColor does NOT throw", ({ expect }) => {
  const App = defineComponent(() => () => (
    <Box ariaHidden backgroundColor="bold" alignSelf="flex-start">
      <Text>secret</Text>
    </Box>
  ));
  let out = "<unset>";
  expect(() => {
    out = renderToString(App, { columns: 100, isScreenReaderEnabled: true });
  }).not.toThrow();
  // Hidden from the screen reader → not rendered → bg never colorized → no throw.
  expect(out).not.toContain("secret");
});

// And the hidden <Text> variant: a screen-reader-hidden Text with a modifier-name
// bg also returns null before colorize, so it must NOT throw either.
test("screen-reader-hidden Text with modifier-name backgroundColor does NOT throw", ({
  expect,
}) => {
  const App = defineComponent(() => () => (
    <Box alignSelf="flex-start">
      <Text ariaHidden backgroundColor="bold">
        secret
      </Text>
    </Box>
  ));
  expect(() => renderToString(App, { columns: 100, isScreenReaderEnabled: true })).not.toThrow();
});
