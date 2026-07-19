import { expect, test } from "vite-plus/test";
import { Box, Text } from "@vue-tui/runtime";
import { render } from "../src/index.ts";

test.sequential("default test presentation ignores ambient INK_SCREEN_READER", async () => {
  const previous = process.env["INK_SCREEN_READER"];
  process.env["INK_SCREEN_READER"] = "true";
  try {
    const result = await render(() => (
      <Box ariaLabel="transcript label">
        <Text>visual child</Text>
      </Box>
    ));
    expect(result.lastFrame()).toContain("visual child");
    expect(result.lastFrame()).not.toContain("transcript label");
  } finally {
    if (previous === undefined) delete process.env["INK_SCREEN_READER"];
    else process.env["INK_SCREEN_READER"] = previous;
  }
});
