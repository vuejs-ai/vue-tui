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

  test("left-edge wide grapheme straddle positions following text correctly", async () => {
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
    expect(frame.startsWith(" x")).toBe(true);
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
