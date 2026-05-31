import { defineComponent } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, Transform } from "@vue-tui/runtime";
import stripAnsi from "strip-ansi";
import stringWidth from "string-width";

function lineWidth(text: string): number {
  return stringWidth(stripAnsi(text));
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

  // A write op that starts EXACTLY at the right clip edge (x === clip.x2) must NOT
  // be short-circuited as a whole — it has to take the per-line clip path so its
  // transformers still run on the (now empty) clipped slice. A transformer that
  // produces output from EMPTY input (e.g. `() => '中'`) emits its output AT the
  // clip edge. Matches Ink output.ts:188 (strict `x > clip.x2`), then the
  // `lines.entries()` loop running `transformer('')`. Captured against the built
  // Ink reference (/tmp/ink @40b3a75, columns=100, renderToString):
  // transform `() => '中'` at x=4 of a width=4 overflow=hidden Box → "    中".
  test("transformer that emits from empty input still runs at the right clip edge (Ink parity)", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={4} height={1} overflow="hidden">
          <Box position="absolute" left={4}>
            <Transform transform={() => "中"}>
              <Text>x</Text>
            </Transform>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    // Ink reference: "    中" — 4 leading spaces then 中 painted at the clip edge.
    expect(stripAnsi(lastFrame()!)).toBe("    中");
  });

  // A transformer that APPENDS to its (empty, clipped) input also runs at the edge:
  // Ink calls it with "" → "" + "X" = "X", painted at the clip edge.
  test("transformer that appends to empty input runs at the right clip edge (Ink parity)", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={4} height={1} overflow="hidden">
          <Box position="absolute" left={4}>
            <Transform transform={(s: string) => `${s}X`}>
              <Text>q</Text>
            </Transform>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    // Ink reference: "    X" — the clipped slice is "", the transform appends "X".
    expect(stripAnsi(lastFrame()!)).toBe("    X");
  });

  // Control: an IDENTITY transform at the same clip edge must emit NOTHING — the
  // clipped slice is empty, identity returns "", characters.length === 0 → skip.
  // Proves the fix only resurrects ops whose transformer produces output from
  // empty input; ops with no net output at the edge stay clipped away.
  test("identity transform at the right clip edge emits nothing (control)", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={4} height={1} overflow="hidden">
          <Box position="absolute" left={4}>
            <Transform transform={(s: string) => s}>
              <Text>x</Text>
            </Transform>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    // Ink reference: "" — clipped to empty, identity transform emits nothing.
    expect(stripAnsi(lastFrame()!)).toBe("");
  });

  // Control: plain text (no transformer) at the right clip edge emits nothing —
  // clipped to empty → characters.length === 0 → skip. Ink reference: "".
  test("plain text at the right clip edge emits nothing (control)", async () => {
    const { lastFrame } = await render(
      defineComponent(() => () => (
        <Box width={4} height={1} overflow="hidden">
          <Box position="absolute" left={4}>
            <Text>x</Text>
          </Box>
        </Box>
      )),
      { columns: 100 },
    );
    // Ink reference: "" — clipped to empty.
    expect(stripAnsi(lastFrame()!)).toBe("");
  });
});
