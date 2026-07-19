// SEQUENTIAL: mutates process.env.TERM and deliberately exercises a mount-time failure.
import { defineComponent, shallowRef, type ComponentPublicInstance } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text, createApp } from "@vue-tui/runtime";
import { useMouseEvent } from "@vue-tui/runtime/fullscreen";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "../lifecycle/test-streams.ts";

test("a visible live target rejects a terminal profile without SGR mouse support", async () => {
  const previousTerm = process.env.TERM;
  process.env.TERM = "dumb";
  const { stream: stdin } = makeFakeStdin();
  const writableStdin = stdin as NodeJS.ReadStream & {
    isRaw?: boolean;
    setRawMode(value: boolean): NodeJS.ReadStream;
  };
  writableStdin.isRaw = false;
  writableStdin.setRawMode = (value) => {
    writableStdin.isRaw = value;
    return stdin;
  };
  const stdout = makeFakeWritable({ columns: 20, rows: 5 });
  const stderr = makeFakeWritable({ columns: 20, rows: 5 });
  const writes = captureWrites(stdout);

  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    useMouseEvent(target, "click", () => "consume");
    return () => (
      <Box ref={target} width={6} height={1} flexShrink={0}>
        <Text>target</Text>
      </Box>
    );
  });
  const app = createApp(App);

  try {
    app.mount({
      mode: "fullscreen",
      stdin,
      stdout,
      stderr,
      patchConsole: false,
      liveUpdates: true,
      maxFps: 0,
      kittyKeyboard: { mode: "disabled" },
    });
    await expect(app.waitUntilExit()).rejects.toThrow(
      "Fullscreen mouse input is unavailable because the terminal does not advertise an xterm-compatible SGR mouse protocol.",
    );

    expect(writes.join("")).not.toContain("\x1b[?1000h");
    expect(writes.join("")).not.toContain("\x1b[?1006h");
    expect(writableStdin.isRaw).toBe(false);
    expect(stdin.listenerCount("data")).toBe(0);
  } finally {
    app.unmount();
    await app.waitUntilExit().catch(() => {});
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
    if (previousTerm === undefined) delete process.env.TERM;
    else process.env.TERM = previousTerm;
  }
});
