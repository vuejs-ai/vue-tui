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

test("nested overflow cannot escape a narrower ancestor clip", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={4} height={1} overflow="hidden">
        <Box width={8} height={1} overflow="hidden" flexShrink={0}>
          <Text>ABCDEFGH</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("ABCD");
});

test("a Transform cannot reopen the exclusive edge of an intersected ancestor clip", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={2} height={1} overflow="hidden">
        <Box marginLeft={2} width={4} height={1} overflow="hidden" flexShrink={0}>
          <Transform transform={() => "X"}>
            <Text>q</Text>
          </Transform>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );

  expect(lastFrame({ trimLines: true })).toBe("");
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

  test("transform returning a wide char cannot straddle the right clip boundary", async () => {
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
    expect(stripAnsi(frame)).toBe("abc");
  });
});

describe("left-edge wide glyph clipping", () => {
  test("text after clipped left-edge wide char preserves its surface column", async () => {
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
    // "中" occupies columns -1..0 and is dropped whole because it straddles the
    // left edge. The following "x" remains at its original column 1.
    expect(stripped).toBe(" x");
  });

  // Clipping still happens before Transform. The transform receives "x", but
  // its output starts at the retained source span's original column 1 rather
  // than being shifted left over the dropped wide grapheme.
  test("transform after clipped left-edge wide char preserves the retained span origin", async () => {
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
    expect(stripAnsi(frame)).toBe(" z");
  });

  test("width-sensitive transform after clipped left-edge wide char keeps that origin", async () => {
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
    expect(stripAnsi(frame)).toBe(" [x]");
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
describe("clip-then-transform input with post-transform containment", () => {
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
    // The Transform still receives "hello", proving clip-before-transform. Its
    // expanded result is then contained by the same five-cell boundary.
    expect(lastFrame({ trimLines: true })).toBe("[hell");
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
    // The inner box is shifted left by 6 cols, so the Transform receives
    // "world". Its expanded result is then contained to the same five cells.
    expect(lastFrame({ trimLines: true })).toBe("[worl");
  });
});
