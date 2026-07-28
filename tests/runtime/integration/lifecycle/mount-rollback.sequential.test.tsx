// Sequential: mount changes process-level terminal ownership while failure rollback is observed.
import ansiEscapes from "ansi-escapes";
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp } from "@vue-tui/runtime";
import { createInternalMountOptions } from "../../../../packages/runtime/dist/internal.mjs";
import { makeRawTrackingStdin, makeTtyWritable } from "./test-streams.ts";

test.sequential("a resize-listener registration failure rolls the whole mount transaction back", () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin, calls: rawModeCalls } = makeRawTrackingStdin();
  const originalOn = stdout.on.bind(stdout) as typeof stdout.on;
  stdout.on = ((event: string, ...args: unknown[]) => {
    if (event === "resize") throw new Error("resize registration failed");
    return (originalOn as (event: string, ...listenerArgs: unknown[]) => NodeJS.WriteStream)(
      event,
      ...args,
    );
  }) as typeof stdout.on;

  const app = createApp(defineComponent(() => () => null));
  let mountError: unknown;
  try {
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        mode: "fullscreen",
        maxFps: 0,
        patchConsole: false,
      }),
    );
  } catch (error) {
    mountError = error;
  }

  const observedBeforeCallerCleanup = {
    error: mountError instanceof Error ? mountError.message : undefined,
    leftAlternateScreen: stdout.chunks.some((chunk) =>
      chunk.includes(ansiEscapes.exitAlternativeScreen),
    ),
    rawMode: stdin.isRaw,
    rawModeCalls: [...rawModeCalls],
  };

  // Let the current implementation clean itself up after the observation. The
  // target implementation has already rolled back, so this is then a no-op.
  stdout.on = originalOn;
  app.unmount();

  expect(observedBeforeCallerCleanup).toEqual({
    error: "resize registration failed",
    leftAlternateScreen: true,
    rawMode: false,
    rawModeCalls: [],
  });
});
