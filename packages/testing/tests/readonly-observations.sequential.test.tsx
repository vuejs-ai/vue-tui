// Vue readonly mutation warnings use the process-global console, so keep this test sequential.
import { expect, test, vi } from "vite-plus/test";
import { Text } from "@vue-tui/runtime";
import { render, type ContentFrame, type TestMouseReportingLevel } from "../src/index.ts";

test.sequential("test-host observations reject runtime mutation", async () => {
  const result = await render(() => <Text>original</Text>);
  const frameCount = result.frames.length;
  const rawMode = result.terminal.rawMode.current;
  const reporting = result.mouse.reporting.current;
  const reportingHistoryLength = result.mouse.reporting.history.length;
  const clipboardRequestCount = result.clipboard.requests.length;
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
      (result.terminal.rawMode as { current: boolean }).current = !rawMode;
    });
    attemptMutation(() => {
      (result.mouse.reporting as { current: TestMouseReportingLevel }).current = "button";
    });
    attemptMutation(() => {
      (result.mouse.reporting.history as TestMouseReportingLevel[]).push("button");
    });
    attemptMutation(() => {
      (result.clipboard.requests as string[]).push("replacement");
    });

    expect(result.frames).toHaveLength(frameCount);
    expect(result.lastFrame()).toBe("original");
    expect(result.terminal.rawMode.current).toBe(rawMode);
    expect(result.mouse.reporting.current).toBe(reporting);
    expect(result.mouse.reporting.history).toHaveLength(reportingHistoryLength);
    expect(result.clipboard.requests).toHaveLength(clipboardRequestCount);
    expect(warn).toHaveBeenCalled();
  } finally {
    warn.mockRestore();
  }
});
