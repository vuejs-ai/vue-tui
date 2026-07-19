// Sequential: these tests mutate the process-GLOBAL env var
// `INK_SCREEN_READER`. The mount path auto-detects it
// (render.ts:526-527: isScreenReaderEnabled =
// options.isScreenReaderEnabled ?? process.env["INK_SCREEN_READER"] === "true").
// Under the repo's file-level parallelism a concurrent sibling in another file
// could observe the mutated value mid-flight (test.sequential only serializes
// WITHIN a file), so per the process-global convention they live here. Each test
// captures the prior value in beforeEach and restores-or-deletes it in afterEach
// so an ambient INK_SCREEN_READER is never blown away.

import { defineComponent, nextTick } from "vue";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import { Box, Text, createApp, useViewportHeight } from "@vue-tui/runtime";
import {
  makeFakeStdin,
  makeFakeWritable,
  captureWrites,
  getContentWrites,
} from "../lifecycle/test-streams.ts";

// Whether INK_SCREEN_READER was set in the ambient environment, and to what.
let hadEnv = false;
let savedEnv: string | undefined;

beforeEach(() => {
  hadEnv = Object.prototype.hasOwnProperty.call(process.env, "INK_SCREEN_READER");
  savedEnv = process.env["INK_SCREEN_READER"];
});

afterEach(() => {
  // Restore the ORIGINAL state: only re-set the value if it was actually
  // present originally; otherwise delete it. Never resurrect/clobber an
  // unset-vs-set distinction so an ambient value survives untouched.
  if (hadEnv) {
    process.env["INK_SCREEN_READER"] = savedEnv;
  } else {
    delete process.env["INK_SCREEN_READER"];
  }
});

test.sequential("INK_SCREEN_READER=true auto-detects SR mode at mount (no explicit option) — linearized output, no border glyphs", async () => {
  process.env["INK_SCREEN_READER"] = "true";

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

  // NO isScreenReaderEnabled option — the env var alone must enable SR mode.
  app.mount({ stdout, stdin, stderr });

  await nextTick();
  await nextTick();

  const content = getContentWrites(writes).join("");
  // SR-linearized text is present...
  expect(content).toContain("Hello world");
  // ...and the 2D box-drawing glyphs are NOT (SR mode linearizes the tree;
  // the non-SR path would emit a bordered grid with these glyphs).
  for (const glyph of ["╭", "╮", "╰", "╯", "─", "│"]) {
    expect(content).not.toContain(glyph);
  }

  app.unmount();
});

test.sequential("INK_SCREEN_READER=true gates behavior that requires a finite visual viewport", async () => {
  process.env["INK_SCREEN_READER"] = "true";

  let viewportHeight: ReturnType<typeof useViewportHeight> | undefined;
  const App = defineComponent(() => {
    viewportHeight = useViewportHeight();
    return () => <Text>flag</Text>;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  app.mount({ stdout, stdin, stderr });

  await nextTick();
  await nextTick();

  expect(viewportHeight).toBeNull();

  app.unmount();
});

test.sequential("explicit isScreenReaderEnabled:false overrides INK_SCREEN_READER=true (?? only falls back when option is undefined)", async () => {
  // Guards the `??` semantics: the env var is the FALLBACK, not an override.
  // A live app explicitly opting OUT must render the visual (bordered) frame
  // even when INK_SCREEN_READER=true.
  process.env["INK_SCREEN_READER"] = "true";

  let viewportHeight: ReturnType<typeof useViewportHeight> | undefined;
  const App = defineComponent(() => {
    viewportHeight = useViewportHeight();
    return () => (
      <Box borderStyle="round">
        <Text>Visible</Text>
      </Box>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  // Explicit false must win over the env var.
  app.mount({ stdout, stdin, stderr, isScreenReaderEnabled: false });

  await nextTick();
  await nextTick();

  expect(viewportHeight?.value).toBe(100);
  const content = getContentWrites(writes).join("");
  expect(content).toContain("Visible");
  // The visual (non-SR) path DOES emit border glyphs.
  expect(content).toContain("─");

  app.unmount();
});
