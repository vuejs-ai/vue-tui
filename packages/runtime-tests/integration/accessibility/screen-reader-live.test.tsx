import { defineComponent, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, createApp, Text } from "@vue-tui/runtime";
import {
  makeFakeStdin,
  makeFakeWritable,
  captureWrites,
  getContentWrites,
} from "../lifecycle/test-streams.ts";

// G03 (Ink parity): the LIVE commit path must branch on isScreenReaderEnabled
// and emit the flat, linearized screen-reader text (via renderScreenReaderOutput),
// NOT the 2D grid produced by paint() — which would include border glyphs.

test.sequential("live commit path emits linear screen-reader text (no border glyphs) when SR enabled", async () => {
  const App = defineComponent(() => {
    return () => (
      <Box borderStyle="round">
        <Text>Hello world</Text>
      </Box>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({
    stdout,
    stdin,
    stderr,
    exitOnCtrlC: false,
    isScreenReaderEnabled: true,
  });

  await nextTick();
  await nextTick();

  const content = getContentWrites(writes).join("");

  // The flat text content must be present.
  expect(content).toContain("Hello world");

  // Border / box-drawing glyphs must NOT appear — SR mode linearizes the tree.
  const borderGlyphs = ["╭", "╮", "╰", "╯", "─", "│"];
  for (const glyph of borderGlyphs) {
    expect(content).not.toContain(glyph);
  }

  app.unmount();
});

test.sequential("live commit path WITHOUT SR still emits 2D grid with border glyphs (contrast)", async () => {
  const App = defineComponent(() => {
    return () => (
      <Box borderStyle="round">
        <Text>Hello world</Text>
      </Box>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({
    stdout,
    stdin,
    stderr,
    exitOnCtrlC: false,
  });

  await nextTick();
  await nextTick();

  const content = getContentWrites(writes).join("");
  expect(content).toContain("Hello world");
  // Non-SR path renders the visual frame, which DOES contain border glyphs.
  expect(content).toContain("─");

  app.unmount();
});
