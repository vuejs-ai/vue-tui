import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { useInternalRenderSession } from "@vue-tui/runtime/internal";
import { MAX_LAYOUT_VALUE } from "../../../runtime/src/numeric-limits.ts";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

test("Inline does not reject a large terminal pair when the rendered region fits", async () => {
  // Inline paints only the rows occupied by the current tree. Rejecting this
  // terminal observation from columns * rows would incorrectly turn a valid
  // one-row application into an unavailable visual host.
  const stdout = makeFakeWritable({ columns: 1_024, rows: 1_025 });
  const stderr = makeFakeWritable({ columns: 1_024, rows: 1_025 });
  const { stream: stdin } = makeFakeStdin();
  let observedSession: ReturnType<typeof useInternalRenderSession>["session"] | undefined;
  const App = defineComponent(() => {
    const { session } = useInternalRenderSession();
    observedSession = session;
    return () => <Text>one row</Text>;
  });
  const app = createApp(App);

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "inline",
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
    });
    await app.waitUntilRenderFlush();
    expect(observedSession!.dimensions).toEqual({
      terminal: { columns: 1_024, rows: 1_025 },
      layout: { columns: 1_024, rows: 1_025 },
    });
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test.each(["inline", "fullscreen"] as const)(
  "%s preserves its last coherent dimensions across out-of-range resize observations",
  async (mode) => {
    const stdout = makeFakeWritable({ columns: 80, rows: 24 });
    const stderr = makeFakeWritable({ columns: 80, rows: 24 });
    const { stream: stdin } = makeFakeStdin();
    let observedSession: ReturnType<typeof useInternalRenderSession>["session"] | undefined;
    const App = defineComponent(() => {
      const { session } = useInternalRenderSession();
      observedSession = session;
      return () => (
        <Text>{`${session.dimensions.layout.columns}x${session.dimensions.layout.rows}`}</Text>
      );
    });
    const app = createApp(App);

    try {
      app.mount({
        stdout,
        stderr,
        stdin,
        mode,
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
      });
      await app.waitUntilRenderFlush();
      expect(observedSession!.dimensions).toEqual({
        terminal: { columns: 80, rows: 24 },
        layout: { columns: 80, rows: 24 },
      });

      stdout.columns = MAX_LAYOUT_VALUE + 1;
      stdout.rows = 12;
      stdout.emit("resize");
      await app.waitUntilRenderFlush();
      expect(observedSession!.dimensions).toEqual({
        terminal: { columns: 80, rows: 24 },
        layout: { columns: 80, rows: 24 },
      });

      stdout.columns = 60;
      stdout.rows = MAX_LAYOUT_VALUE + 1;
      stdout.emit("resize");
      await app.waitUntilRenderFlush();
      expect(observedSession!.dimensions).toEqual({
        terminal: { columns: 80, rows: 24 },
        layout: { columns: 80, rows: 24 },
      });

      stdout.columns = 60;
      stdout.rows = 20;
      stdout.emit("resize");
      await app.waitUntilRenderFlush();
      expect(observedSession!.dimensions).toEqual({
        terminal: { columns: 60, rows: 20 },
        layout: { columns: 60, rows: 20 },
      });
    } finally {
      app.unmount();
      await app.waitUntilExit();
      stdin.destroy();
      stdout.destroy();
      stderr.destroy();
    }
  },
);
