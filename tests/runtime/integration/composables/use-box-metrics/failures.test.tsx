import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, createApp, Text, useBoxMetrics } from "@vue-tui/runtime";
import { createInternalMountOptions } from "../../../../../packages/runtime/dist/internal.mjs";
import { makeTtyInput, makeTtyOutput } from "./harness.ts";

test("does not publish a candidate Box size before a failed output write is accepted", async () => {
  const width = shallowRef(4);
  const marker = shallowRef("ready");
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    return () => (
      <Box ref={target} width={width.value} height={1}>
        <Text>{marker.value}</Text>
      </Box>
    );
  });

  const stdout = makeTtyOutput();
  const stderr = makeTtyOutput();
  const stdin = makeTtyInput();
  const originalWrite = stdout.write.bind(stdout);
  const injected = new Error("injected Box-metrics frame failure");
  let sizeDuringFailure: { width: number; height: number; hasMeasured: boolean } | undefined;
  let failNextFrameWrite = false;
  stdout.write = ((...args: unknown[]) => {
    if (failNextFrameWrite) {
      failNextFrameWrite = false;
      sizeDuringFailure = {
        width: metrics.width.value,
        height: metrics.height.value,
        hasMeasured: metrics.hasMeasured.value,
      };
      throw injected;
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  const app = createApp(App);
  try {
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        maxFps: 0,
        patchConsole: false,
      }),
    );
    await app.waitUntilRenderFlush();
    const accepted = {
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    };
    expect(accepted).toEqual({ width: 4, height: 1, hasMeasured: true });

    const exited = app.waitUntilExit();
    width.value = 7;
    marker.value = "FAILED_SIZE_FRAME";
    failNextFrameWrite = true;
    stdout.columns = 19;
    stdout.emit("resize");

    await expect(exited).rejects.toBe(injected);
    expect(sizeDuringFailure).toEqual(accepted);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("rejects non-Box targets and use outside a vue-tui tree", async () => {
  expect(() => useBoxMetrics(shallowRef<InstanceType<typeof Box> | null>(null))).toThrow(
    "render session is unavailable outside a vue-tui render tree",
  );

  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    useBoxMetrics(target);
    return () => <Text ref={target}>wrong target</Text>;
  });
  const stdout = makeTtyOutput();
  const stderr = makeTtyOutput();
  const stdin = makeTtyInput();
  const app = createApp(App);
  app.config.warnHandler = () => {};
  try {
    const exited = app.waitUntilExit();
    expect(() =>
      app.mount(
        createInternalMountOptions({
          stdout,
          stderr,
          stdin,
          maxFps: 0,
          patchConsole: false,
        }),
      ),
    ).toThrow("useBoxMetrics() target must be a ref bound directly to <Box>");
    await expect(exited).rejects.toThrow(
      "useBoxMetrics() target must be a ref bound directly to <Box>",
    );
  } finally {
    app.unmount();
    await Promise.allSettled([app.waitUntilExit()]);
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});
