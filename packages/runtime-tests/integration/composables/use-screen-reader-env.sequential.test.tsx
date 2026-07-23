// Sequential: this test temporarily mutates the process-global environment.

import { defineComponent, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text, createApp, useViewportHeight } from "@vue-tui/runtime";
import {
  captureWrites,
  getContentWrites,
  makeFakeStdin,
  makeFakeWritable,
} from "../lifecycle/test-streams.ts";

test.sequential("INK_SCREEN_READER does not select a hidden presentation", async () => {
  const hadEnv = Object.prototype.hasOwnProperty.call(process.env, "INK_SCREEN_READER");
  const previous = process.env["INK_SCREEN_READER"];
  process.env["INK_SCREEN_READER"] = "true";

  let app: ReturnType<typeof createApp> | undefined;
  try {
    let viewportHeight: ReturnType<typeof useViewportHeight> | undefined;
    const App = defineComponent(() => {
      viewportHeight = useViewportHeight();
      return () => (
        <Box borderStyle="round">
          <Text>visual output</Text>
        </Box>
      );
    });
    const stdout = makeFakeWritable({ columns: 80, rows: 24 });
    const stderr = makeFakeWritable({ columns: 80, rows: 24 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app = createApp(App);
    app.mount({ stdout, stdin, stderr });
    await nextTick();
    await app.waitUntilRenderFlush();

    expect(viewportHeight?.value).toBe(24);
    const output = getContentWrites(writes).join("");
    expect(output).toContain("visual output");
    expect(output).toContain("─");
  } finally {
    app?.unmount();
    if (hadEnv) process.env["INK_SCREEN_READER"] = previous;
    else delete process.env["INK_SCREEN_READER"];
  }
});
