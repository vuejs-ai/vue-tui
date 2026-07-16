import { defineComponent } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, Transform } from "@vue-tui/runtime";
import stripAnsi from "strip-ansi";
import stringWidth from "string-width";

/** Build a round-border box string like boxen(text, { borderStyle: "round" }) */
function box(text: string): string {
  const lines = text.split("\n");
  const width = Math.max(...lines.map((l) => l.length));
  const top = `╭${"─".repeat(width)}╮`;
  const bottom = `╰${"─".repeat(width)}╯`;
  const middle = lines.map((l) => `│${l.padEnd(width)}│`).join("\n");
  return `${top}\n${middle}\n${bottom}`;
}

/** Clip each line to at most `columns` visible characters and trim trailing whitespace */
function clipX(text: string, columns: number): string {
  return text
    .split("\n")
    .map((line) => line.slice(0, columns).trim())
    .join("\n");
}

// --- overflowX tests ---

test("overflowX - single text node in a box inside overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6} overflowX="hidden">
        <Box width={16} flexShrink={0}>
          <Text>Hello World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Hello");
});

test("overflowX - single text node inside overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6} overflowX="hidden" borderStyle="round">
        <Box width={16} flexShrink={0}>
          <Text>Hello World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(box("Hell"));
});

test("overflowX - single text node in a box with border inside overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6} overflowX="hidden">
        <Box width={16} flexShrink={0} borderStyle="round">
          <Text>Hello World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(clipX(box("Hello"), 6));
});

test("overflowX - multiple text nodes in a box inside overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6} overflowX="hidden" flexDirection="row">
        <Box width={12} flexShrink={0} flexDirection="row">
          <Text>Hello </Text>
          <Text>World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Hello");
});

test("overflowX - multiple text nodes in a box inside overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={8} overflowX="hidden" borderStyle="round" flexDirection="row">
        <Box width={12} flexShrink={0} flexDirection="row">
          <Text>Hello </Text>
          <Text>World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(box("Hello "));
});

test("overflowX - multiple text nodes in a box with border inside overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={8} overflowX="hidden" flexDirection="row">
        <Box width={12} flexShrink={0} borderStyle="round" flexDirection="row">
          <Text>Hello </Text>
          <Text>World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(clipX(box("HelloWo\n"), 8));
});

test("overflowX - multiple boxes inside overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6} overflowX="hidden" flexDirection="row">
        <Box width={6} flexShrink={0}>
          <Text>Hello </Text>
        </Box>
        <Box width={6} flexShrink={0}>
          <Text>World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Hello");
});

test("overflowX - multiple boxes inside overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={8} overflowX="hidden" borderStyle="round" flexDirection="row">
        <Box width={6} flexShrink={0}>
          <Text>Hello </Text>
        </Box>
        <Box width={6} flexShrink={0}>
          <Text>World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(box("Hello "));
});

test("overflowX - box before left edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6} overflowX="hidden">
        <Box marginLeft={-12} width={6} flexShrink={0}>
          <Text>Hello</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("");
});

test("overflowX - box before left edge of overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6} overflowX="hidden" borderStyle="round">
        <Box marginLeft={-12} width={6} flexShrink={0}>
          <Text>Hello</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(box(" ".repeat(4)));
});

test("overflowX - box intersecting with left edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6} overflowX="hidden">
        <Box marginLeft={-3} width={12} flexShrink={0}>
          <Text>Hello World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("lo Wor");
});

test("overflowX - box intersecting with left edge of overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={8} overflowX="hidden" borderStyle="round">
        <Box marginLeft={-3} width={12} flexShrink={0}>
          <Text>Hello World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(box("lo Wor"));
});

test("overflowX - box after right edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6} overflowX="hidden">
        <Box marginLeft={6} width={6} flexShrink={0}>
          <Text>Hello</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("");
});

test("overflowX - box intersecting with right edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={6} overflowX="hidden">
        <Box marginLeft={3} width={6} flexShrink={0}>
          <Text>Hello</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("   Hel");
});

// --- overflowY tests ---

test("overflowY - single text node inside overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={1} overflowY="hidden">
        <Text>Hello{"\n"}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Hello");
});

test("overflowY - single text node inside overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={20} height={3} overflowY="hidden" borderStyle="round">
        <Text>Hello{"\n"}World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(box("Hello".padEnd(18, " ")));
});

test("overflowY - multiple boxes inside overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={2} overflowY="hidden" flexDirection="column">
        <Box flexShrink={0}>
          <Text>Line #1</Text>
        </Box>
        <Box flexShrink={0}>
          <Text>Line #2</Text>
        </Box>
        <Box flexShrink={0}>
          <Text>Line #3</Text>
        </Box>
        <Box flexShrink={0}>
          <Text>Line #4</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Line #1\nLine #2");
});

test("overflowY - multiple boxes inside overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={9} height={4} overflowY="hidden" flexDirection="column" borderStyle="round">
        <Box flexShrink={0}>
          <Text>Line #1</Text>
        </Box>
        <Box flexShrink={0}>
          <Text>Line #2</Text>
        </Box>
        <Box flexShrink={0}>
          <Text>Line #3</Text>
        </Box>
        <Box flexShrink={0}>
          <Text>Line #4</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(box("Line #1\nLine #2"));
});

test("overflowY - box above top edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={1} overflowY="hidden">
        <Box marginTop={-2} height={2} flexShrink={0}>
          <Text>Hello{"\n"}World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("");
});

test("overflowY - box above top edge of overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={7} height={3} overflowY="hidden" borderStyle="round">
        <Box marginTop={-3} height={2} flexShrink={0}>
          <Text>Hello{"\n"}World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(box(" ".repeat(5)));
});

test("overflowY - box intersecting with top edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={1} overflowY="hidden">
        <Box marginTop={-1} height={2} flexShrink={0}>
          <Text>Hello{"\n"}World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("World");
});

test("overflowY - box intersecting with top edge of overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={7} height={3} overflowY="hidden" borderStyle="round">
        <Box marginTop={-1} height={2} flexShrink={0}>
          <Text>Hello{"\n"}World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(box("World"));
});

test("overflowY - box below bottom edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={1} overflowY="hidden">
        <Box marginTop={1} height={2} flexShrink={0}>
          <Text>Hello{"\n"}World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("");
});

test("overflowY - box below bottom edge of overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={7} height={3} overflowY="hidden" borderStyle="round">
        <Box marginTop={2} height={2} flexShrink={0}>
          <Text>Hello{"\n"}World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(box(" ".repeat(5)));
});

test("overflowY - box intersecting with bottom edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box height={1} overflowY="hidden">
        <Box height={2} flexShrink={0}>
          <Text>Hello{"\n"}World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Hello");
});

test("overflowY - box intersecting with bottom edge of overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={7} height={3} overflowY="hidden" borderStyle="round">
        <Box height={2} flexShrink={0}>
          <Text>Hello{"\n"}World</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe(box("Hello"));
});

// unified overflow tests
test("overflow - single text node inside overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingBottom={1}>
        <Box width={6} height={1} overflow="hidden">
          <Box width={12} height={2} flexShrink={0}>
            <Text>Hello{"\n"}World</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Hello\n");
});

test("overflow - single text node inside overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingBottom={1}>
        <Box width={8} height={3} overflow="hidden" borderStyle="round">
          <Box width={12} height={2} flexShrink={0}>
            <Text>Hello{"\n"}World</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("╭──────╮\n│Hello │\n╰──────╯\n");
});

test("overflow - multiple boxes inside overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingBottom={1}>
        <Box width={4} height={1} overflow="hidden" flexDirection="row">
          <Box width={2} height={2} flexShrink={0}>
            <Text>TL{"\n"}BL</Text>
          </Box>
          <Box width={2} height={2} flexShrink={0}>
            <Text>TR{"\n"}BR</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("TLTR\n");
});

test("overflow - multiple boxes inside overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingBottom={1}>
        <Box width={6} height={3} overflow="hidden" borderStyle="round" flexDirection="row">
          <Box width={2} height={2} flexShrink={0}>
            <Text>TL{"\n"}BL</Text>
          </Box>
          <Box width={2} height={2} flexShrink={0}>
            <Text>TR{"\n"}BR</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("╭────╮\n│TLTR│\n╰────╯\n");
});

test("overflow - box intersecting with top left edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={4} height={4} overflow="hidden">
        <Box marginTop={-2} marginLeft={-2} width={4} height={4} flexShrink={0}>
          <Text>
            AAAA{"\n"}BBBB{"\n"}CCCC{"\n"}DDDD
          </Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("CC\nDD\n\n");
});

test("overflow - box intersecting with top right edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={4} height={4} overflow="hidden">
        <Box marginTop={-2} marginLeft={2} width={4} height={4} flexShrink={0}>
          <Text>
            AAAA{"\n"}BBBB{"\n"}CCCC{"\n"}DDDD
          </Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("  CC\n  DD\n\n");
});

test("overflow - box intersecting with bottom left edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={4} height={4} overflow="hidden">
        <Box marginTop={2} marginLeft={-2} width={4} height={4} flexShrink={0}>
          <Text>
            AAAA{"\n"}BBBB{"\n"}CCCC{"\n"}DDDD
          </Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\nAA\nBB");
});

test("overflow - box intersecting with bottom right edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={4} height={4} overflow="hidden">
        <Box marginTop={2} marginLeft={2} width={4} height={4} flexShrink={0}>
          <Text>
            AAAA{"\n"}BBBB{"\n"}CCCC{"\n"}DDDD
          </Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\n  AA\n  BB");
});

test("nested overflow", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingBottom={1}>
        <Box width={4} height={4} overflow="hidden" flexDirection="column">
          <Box width={2} height={2} overflow="hidden">
            <Box width={4} height={4} flexShrink={0}>
              <Text>
                AAAA{"\n"}BBBB{"\n"}CCCC{"\n"}DDDD
              </Text>
            </Box>
          </Box>

          <Box width={4} height={3}>
            <Text>
              XXXX{"\n"}YYYY{"\n"}ZZZZ
            </Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AA\nBB\nXXXX\nYYYY\n");
});

/** Build a round-border box of the given inner width / total height, like
 * boxen('', { width, height, borderStyle: 'round' }). All lines are exactly
 * `width` columns wide (the border glyphs included). */
// Visual Inline is a hard terminal-cell boundary. Unlike Ink's unbounded frame,
// no glyph may survive past column 10 and trigger an extra physical wrap.
test("out of bounds writes are hard-clipped to the Inline terminal width", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Box width={12} height={10} borderStyle="round" />),
    { columns: 10 },
  );

  const expected = [`╭${"─".repeat(9)}`, ...Array<string>(8).fill("│"), `╰${"─".repeat(9)}`].join(
    "\n",
  );

  expect(lastFrame()).toBe(expected);
});

// --- absolute overlay wide glyph clipping (issue #10) ---

function lineWidth(text: string): number {
  return stringWidth(stripAnsi(text));
}

describe("absolute overlay wide glyph clipping", () => {
  test("wide char at right edge of clipped box is omitted", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={4} height={1} overflow="hidden">
          <Text>abc</Text>
          <Box position="absolute" left={3}>
            <Text>中</Text>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    const frame = lastFrame({ trimLines: true })!;
    expect(stripAnsi(frame)).toBe("abc");
  });

  test("wide emoji at right edge of clipped box is omitted", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={4} height={1} overflow="hidden">
          <Text>abc</Text>
          <Box position="absolute" left={3}>
            <Text>🍔</Text>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    const frame = lastFrame({ trimLines: true })!;
    expect(stripAnsi(frame)).toBe("abc");
  });

  test("wide char fully inside clipped box is preserved", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={4} height={1} overflow="hidden">
          <Text>a</Text>
          <Box position="absolute" left={2}>
            <Text>中</Text>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    const frame = lastFrame({ trimLines: true })!;
    expect(stripAnsi(frame)).toContain("中");
    expect(lineWidth(frame)).toBeLessThanOrEqual(4);
  });

  test("output does not exceed terminal columns with absolute wide char", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={8} height={1} overflow="hidden">
          <Text>hello</Text>
          <Box position="absolute" left={7}>
            <Text>你好</Text>
          </Box>
        </Box>
      )),
      { columns: 8 },
    );
    const frame = lastFrame({ trimLines: true })!;
    for (const line of frame.split("\n")) {
      expect(lineWidth(line)).toBeLessThanOrEqual(8);
    }
  });

  // G63: Ink clips THEN transforms, and never re-clips the transformer's output.
  // The source char "x" (width 1) sits at left=3, fully inside the width-4 clip, so
  // it survives the horizontal clip; the transform then replaces it with the wide
  // "中" (width 2), which is emitted UNCLIPPED past the boundary. Ink reference
  // (v7.0.4) renders exactly "abc中" here. Previously vue-tui clipped AFTER the
  // transform (commit 2c99431), dropping the "中" — that was the non-Ink order G63
  // reverses, so this test now asserts Ink's clip-then-transform output.
  test("transform returning wide char in clipped box overflows (Ink clip-then-transform)", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={4} height={1} overflow="hidden">
          <Text>abc</Text>
          <Box position="absolute" left={3}>
            <Transform transform={() => "中"}>
              <Text>x</Text>
            </Transform>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    const frame = lastFrame({ trimLines: true })!;
    expect(stripAnsi(frame)).toBe("abc中");
  });
});

describe("left-edge wide glyph clipping", () => {
  test("text after clipped left-edge wide char starts at clip origin (Ink parity)", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={4} height={1} overflow="hidden">
          <Box marginLeft={-1} flexShrink={0}>
            <Text>中x</Text>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    const frame = lastFrame({ trimLines: true })!;
    const stripped = stripAnsi(frame);
    // "中" (width 2) starts at col -1, straddling the left edge → clipped whole.
    // Ink output.ts:210-212 sets the write origin to the clipped left edge, so the
    // kept "x" starts AT that origin with NO leading offset. Verified against the
    // built Ink reference (/tmp/ink-40b3a75 renderToString of this exact tree → "x").
    // (Was vue-tui-specific " x" leading-space padding; rewritten to Ink. See the
    // G63 decisions-log entry in .agents/docs/parity-ledger.md.)
    expect(stripped).toBe("x");
  });

  // G63 MUST-FIX: after a LEFT horizontal clip, the per-line write origin is set
  // to the clipped left edge (Ink output.ts:210-212 `x = clip.x1`), THEN the
  // transform runs and writes from that origin. So a wide glyph straddling the
  // left edge is clipped whole and the kept content starts AT the clip origin —
  // no leading offset. Verified against the built Ink reference (/tmp/ink-40b3a75,
  // renderToString of the SAME component): transform=>"z" → "z", [l] → "[x]".
  test("transform after clipped left-edge wide char starts at clip origin (Ink parity)", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={4} height={1} overflow="hidden">
          <Box marginLeft={-1} flexShrink={0}>
            <Transform transform={() => "z"}>
              <Text>中x</Text>
            </Transform>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    const frame = lastFrame({ trimLines: true })!;
    expect(stripAnsi(frame)).toBe("z");
  });

  test("width-sensitive transform after clipped left-edge wide char (Ink parity)", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={4} height={1} overflow="hidden">
          <Box marginLeft={-1} flexShrink={0}>
            <Transform transform={(l: string) => `[${l}]`}>
              <Text>中x</Text>
            </Transform>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    const frame = lastFrame({ trimLines: true })!;
    expect(stripAnsi(frame)).toBe("[x]");
  });

  test("wide chars clipped on both edges simultaneously", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={2} height={1} overflow="hidden">
          <Box marginLeft={-1} width={6} flexShrink={0}>
            <Text>中中中</Text>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    const frame = lastFrame({ trimLines: true })!;
    expect(lineWidth(frame)).toBeLessThanOrEqual(2);
  });
});

// G63: Ink clips a line horizontally FIRST, THEN applies the line transformer to
// the already-clipped span (output.ts: the `clipHorizontally` sliceAnsi map runs
// before the `lines.entries()` loop that calls `transformer(line, index)`). So a
// width-sensitive transform inside an overflowX:"hidden" box must receive the
// CLIPPED substring, not the full line. The buggy order (transform-then-clip)
// feeds the transformer the full line and slices its output, which corrupts
// gradients (wrong char count) and OSC-8 hyperlinks (closing sequence sliced off).
describe("G63 clip-then-transform order (Ink parity)", () => {
  test("transform inside overflowX hidden receives the clipped span", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={5} overflowX="hidden">
          <Box width={16} flexShrink={0}>
            <Transform transform={(l: string) => `[${l}]`}>
              <Text>hello world</Text>
            </Transform>
          </Box>
        </Box>
      )),
      { columns: 20 },
    );
    // Ink reference (v7.0.4, columns=20): the line "hello world" is clipped to the
    // 5-col content area → "hello", THEN the transform brackets it → "[hello]"
    // (verified by running renderToString against the pinned Ink build).
    // The buggy transform-then-clip order brackets the full line "[hello world]"
    // then slices to 5 cols → "[hell".
    expect(lastFrame({ trimLines: true })).toBe("[hello]");
  });

  test("transform inside overflowX hidden — left clip feeds the right span", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={5} overflowX="hidden">
          <Box width={16} marginLeft={-6} flexShrink={0}>
            <Transform transform={(l: string) => `[${l}]`}>
              <Text>hello world</Text>
            </Transform>
          </Box>
        </Box>
      )),
      { columns: 20 },
    );
    // The inner box is shifted left by 6 cols, so the visible window over
    // "hello world" is columns 6..10 → "world". Ink clips to "world" first, then
    // brackets → "[world]". The buggy order would bracket "[hello world]" then
    // slice columns 6..10 of THAT → "world" (no brackets), so the brackets reveal
    // which span the transform actually saw.
    expect(lastFrame({ trimLines: true })).toBe("[world]");
  });
});
