import { defineComponent, isReadonly, nextTick, shallowRef, watchSyncEffect } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, createApp, Text, useBoxMetrics } from "@vue-tui/runtime";
import { createInternalMountOptions } from "../../../../../packages/runtime/dist/internal.mjs";
import { makeTtyInput, makeTtyOutput } from "./harness.ts";

test.each(["inline", "fullscreen"] as const)(
  "publishes the frozen accepted Box size in %s mode",
  async (mode) => {
    let metrics!: ReturnType<typeof useBoxMetrics>;
    const stable = shallowRef("one");
    const App = defineComponent(() => {
      const target = shallowRef<InstanceType<typeof Box> | null>(null);
      metrics = useBoxMetrics(target);
      return () => (
        <Box>
          <Box ref={target} width={4} height={2}>
            <Text>{stable.value}</Text>
          </Box>
        </Box>
      );
    });

    const result = await render(App, { columns: 20, rows: 6, mode });
    try {
      expect({
        width: metrics.width.value,
        height: metrics.height.value,
        hasMeasured: metrics.hasMeasured.value,
      }).toEqual({ width: 4, height: 2, hasMeasured: true });
      expect(isReadonly(metrics.width)).toBe(true);
      expect(isReadonly(metrics.height)).toBe(true);
      expect(isReadonly(metrics.left)).toBe(true);
      expect(isReadonly(metrics.top)).toBe(true);
      expect(isReadonly(metrics.hasMeasured)).toBe(true);
      expect(metrics.hasMeasured.value).toBe(true);

      const accepted = {
        width: metrics.width.value,
        height: metrics.height.value,
        left: metrics.left.value,
        top: metrics.top.value,
      };
      stable.value = "two";
      await nextTick();
      await result.waitUntilRenderFlush();
      expect({
        width: metrics.width.value,
        height: metrics.height.value,
        left: metrics.left.value,
        top: metrics.top.value,
      }).toEqual(accepted);
    } finally {
      result.dispose();
    }
  },
);

test("updates after sibling-driven reflow and terminal resize without rerendering the Box", async () => {
  const sibling = shallowRef("one");
  let targetRenders = 0;
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const StableTarget = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    return () => {
      targetRenders++;
      return (
        <Box ref={target} width="100%" height={2}>
          <Text>target</Text>
        </Box>
      );
    };
  });
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Text>{sibling.value}</Text>
      <StableTarget />
    </Box>
  ));

  const result = await render(App, { columns: 100, rows: 10 });
  try {
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 100, height: 2, hasMeasured: true });
    expect(targetRenders).toBe(1);

    sibling.value = "one\ntwo\nthree";
    await nextTick();
    await result.waitUntilRenderFlush();
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 100, height: 2, hasMeasured: true });
    expect(targetRenders).toBe(1);

    await result.terminal.resize(60, 10);
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 60, height: 2, hasMeasured: true });
    expect(targetRenders).toBe(1);
  } finally {
    result.dispose();
  }
});

test("publishes parent-relative left and top for a sibling-positioned Box", async () => {
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    return () => (
      <Box flexDirection="row">
        <Box width={5} height={1}>
          <Text>left</Text>
        </Box>
        <Box ref={target} width={3} height={2}>
          <Text>box</Text>
        </Box>
      </Box>
    );
  });

  const stdout = makeTtyOutput(40, 8);
  const stderr = makeTtyOutput(40, 8);
  const stdin = makeTtyInput();
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
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      left: metrics.left.value,
      top: metrics.top.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 3, height: 2, left: 5, top: 0, hasMeasured: true });
  } finally {
    app.unmount();
    await Promise.allSettled([app.waitUntilExit()]);
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("publishes each accepted rectangle as one coherent reactive snapshot", async () => {
  const rectangle = shallowRef({ width: 2, height: 1, left: 1, top: 1 });
  const observed: Array<{
    width: number;
    height: number;
    left: number;
    top: number;
    hasMeasured: boolean;
  }> = [];
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    watchSyncEffect(() => {
      const snapshot = {
        width: metrics.width.value,
        height: metrics.height.value,
        left: metrics.left.value,
        top: metrics.top.value,
        hasMeasured: metrics.hasMeasured.value,
      };
      if (snapshot.hasMeasured) observed.push(snapshot);
    });
    return () => (
      <Box width={20} height={6}>
        <Box
          ref={target}
          position="absolute"
          width={rectangle.value.width}
          height={rectangle.value.height}
          left={rectangle.value.left}
          top={rectangle.value.top}
        />
      </Box>
    );
  });

  const result = await render(App, { columns: 20, rows: 6 });
  try {
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      left: metrics.left.value,
      top: metrics.top.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 2, height: 1, left: 1, top: 1, hasMeasured: true });

    observed.length = 0;
    rectangle.value = { width: 4, height: 2, left: 3, top: 2 };
    await nextTick();
    await result.waitUntilRenderFlush();

    expect(observed.length).toBeGreaterThan(0);
    for (const snapshot of observed) {
      expect(snapshot).toEqual({
        width: 4,
        height: 2,
        left: 3,
        top: 2,
        hasMeasured: true,
      });
    }
  } finally {
    result.dispose();
  }
});
