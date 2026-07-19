import { defineComponent } from "vue";
import { describe, test, expect } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

describe("Output character model", () => {
  test("variation selector emoji characters align correctly within borders", async () => {
    const App = defineComponent(() => () => (
      <Box borderStyle="round" width={8}>
        <Text>🌡️⚠️✅</Text>
      </Box>
    ));
    const { lastFrame } = await render(App, { columns: 100 });
    const frame = lastFrame()!;
    const lines = frame.split("\n");
    // The text line (line 1) must have a closing right border "│"
    // With the old placeLine implementation, variation selector emojis
    // miscount visual width and the right border is lost.
    expect(lines[1]).toContain("│");
    expect(lines[1]!.endsWith("│")).toBe(true);
  });

  test("wide CJK characters occupy two cells", async () => {
    const App = defineComponent(() => () => (
      <Box borderStyle="single" width={8}>
        <Text>你好世</Text>
      </Box>
    ));
    const { lastFrame } = await render(App, { columns: 100 });
    const frame = lastFrame()!;
    const lines = frame.split("\n");
    expect(lines[1]!.endsWith("│")).toBe(true);
  });

  test("simple emoji characters align within borders", async () => {
    const App = defineComponent(() => () => (
      <Box borderStyle="round" width={8}>
        <Text>🦾🌏😋</Text>
      </Box>
    ));
    const { lastFrame } = await render(App, { columns: 100 });
    const frame = lastFrame()!;
    const lines = frame.split("\n");
    // All lines must end with the right border character
    expect(lines[0]!.endsWith("╮")).toBe(true);
    expect(lines[1]!.endsWith("│")).toBe(true);
    expect(lines[2]!.endsWith("╯")).toBe(true);
  });
});
