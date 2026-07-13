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

  test("left-edge wide grapheme straddle preserves following text's surface column", async () => {
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
    // "中" occupies source columns -1..0 and is dropped whole because it
    // straddles the left clip edge. The following "x" belongs at column 1, so
    // clipping must leave column 0 blank instead of reflowing "x" to the edge.
    expect(frame).toBe(" x");
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

  test("transformer output at the exclusive right clip edge remains hidden", async () => {
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
    expect(stripAnsi(lastFrame()!)).toBe("");
  });

  test("transformer append at the exclusive right clip edge remains hidden", async () => {
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
    expect(stripAnsi(lastFrame()!)).toBe("");
  });

  // Control: an IDENTITY transform at the same clip edge must emit NOTHING — the
  // clipped slice is empty, identity returns "", characters.length === 0 → skip.
  // Together with the two expanding-transform cases above, this proves the
  // exclusive overflow edge contains every callback result.
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
