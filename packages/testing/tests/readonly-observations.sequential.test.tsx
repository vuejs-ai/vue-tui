// Vue readonly mutation warnings use the process-global console, so keep this test sequential.
import { expect, test, vi } from "vite-plus/test";
import { Text } from "@vue-tui/runtime";
import { render, type ContentFrame } from "../src/index.ts";

test.sequential("frames and session reject runtime mutation", async () => {
  const result = await render(() => <Text>original</Text>);
  const frameCount = result.frames.length;
  const layoutColumns = result.session.dimensions.layout.columns;
  const rawMode = result.terminal.rawMode.current;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const attemptMutation = (mutation: () => void) => {
    try {
      mutation();
    } catch {
      // A frozen readonly snapshot may throw while a Vue readonly proxy warns and ignores.
    }
  };

  try {
    // The public API is readonly at the type level; these casts simulate an untyped consumer.
    attemptMutation(() => {
      (result.frames as ContentFrame[]).push({ dynamic: "replacement", staticOutput: "" });
    });
    attemptMutation(() => {
      (result.session.dimensions.layout as { columns: number }).columns = 1;
    });
    attemptMutation(() => {
      (result.terminal.rawMode as { current: boolean }).current = !rawMode;
    });

    expect(result.frames).toHaveLength(frameCount);
    expect(result.lastFrame()).toBe("original");
    expect(result.session.dimensions.layout.columns).toBe(layoutColumns);
    expect(result.terminal.rawMode.current).toBe(rawMode);
    expect(warn).toHaveBeenCalled();
  } finally {
    warn.mockRestore();
  }
});
