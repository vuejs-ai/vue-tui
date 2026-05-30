import { defineComponent } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, measureText } from "@vue-tui/runtime";
import stripAnsi from "strip-ansi";

function lineWidth(text: string): number {
  return measureText(stripAnsi(text), 9999).width;
}

describe("grapheme-aware clipping (issue #21)", () => {
  test("ZWJ emoji at right clip edge is dropped whole, not split", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={4} height={1} overflow="hidden">
          <Text>ab</Text>
          <Box position="absolute" left={3}>
            <Text>👨‍👩‍👧‍👦</Text>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    const frame = stripAnsi(lastFrame({ trimLines: true })!);
    expect(lineWidth(frame)).toBeLessThanOrEqual(4);
    expect(frame).not.toContain("👨");
  });

  test("left-edge wide grapheme straddle starts following text at clip origin (Ink parity)", async () => {
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
    const frame = stripAnsi(lastFrame({ trimLines: true })!);
    // "中" (width 2) straddles the left clip edge → dropped whole. Ink output.ts:210-212
    // sets the write origin to the clipped left edge, so the kept "x" starts AT that
    // origin with NO leading space. Verified against the built Ink reference
    // (/tmp/ink-40b3a75 renderToString of this exact tree → "x"). Previously this
    // locked vue-tui's leading-space padding (" x"); rewritten to Ink per the G63
    // decisions-log entry in .agents/docs/parity-ledger.md.
    expect(frame).toBe("x");
  });

  // absolute-non-edge class (R2-000045): an absolutely-positioned ZWJ emoji is
  // kept whole, matching Ink (verified via ink-testing-library:
  // ["coabc", "ct👨‍👩‍👧‍👦"]).
  test("absolutely-positioned ZWJ emoji is not split", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={7} height={2}>
          <Text>coabc</Text>
          <Box position="absolute" marginTop={1}>
            <Text>ct👨‍👩‍👧‍👦</Text>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    const lines = stripAnsi(lastFrame({ trimLines: true })!).split("\n");
    expect(lines[0]).toBe("coabc");
    expect(lines[1]).toBe("ct👨‍👩‍👧‍👦");
  });
});
