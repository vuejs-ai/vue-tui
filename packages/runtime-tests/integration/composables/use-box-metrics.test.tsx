import { PassThrough } from "node:stream";
import { defineComponent, isReadonly, nextTick, shallowRef, vShow, withDirectives } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, createApp, Text, useBoxMetrics } from "@vue-tui/runtime";
import { createInternalMountOptions } from "../../../runtime/dist/internal.mjs";

function makeTtyOutput(columns = 20, rows = 4): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: true, columns, rows });
  return stream;
}

function makeTtyInput(): NodeJS.ReadStream {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stream, {
    isTTY: true,
    setRawMode() {
      return stream;
    },
    setEncoding() {
      return stream;
    },
    ref() {},
    unref() {},
  });
  return stream;
}

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

    const result = await render(App, { columns: 20, rows: 6, host: { mode } });
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

test("distinguishes zero size, clipping, hidden state, and detachment", async () => {
  const visible = shallowRef(true);
  const hidden = shallowRef(false);
  const clipped = shallowRef(false);
  const zero = shallowRef(true);
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    return () =>
      visible.value ? (
        <Box width={5} height={1} overflowY="hidden">
          {withDirectives(
            <Box
              ref={target}
              position={clipped.value ? "absolute" : undefined}
              top={clipped.value ? 2 : undefined}
              width={zero.value ? 0 : 3}
              height={zero.value ? 0 : 1}
            />,
            [[vShow, !hidden.value]],
          )}
        </Box>
      ) : null;
  });

  const result = await render(App, { columns: 10, rows: 3 });
  try {
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 0, height: 0, hasMeasured: true });

    zero.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 3, height: 1, hasMeasured: true });

    clipped.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 3, height: 1, hasMeasured: true });

    hidden.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(metrics.hasMeasured.value).toBe(false);
    expect(metrics.width.value).toBe(0);
    expect(metrics.height.value).toBe(0);

    hidden.value = false;
    clipped.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 3, height: 1, hasMeasured: true });

    visible.value = false;
    await nextTick();
    expect(metrics.hasMeasured.value).toBe(false);
    expect(metrics.width.value).toBe(0);
    expect(metrics.height.value).toBe(0);
  } finally {
    result.dispose();
  }
});

test("clears a previous size while a replacement Box awaits accepted paint", async () => {
  const replacement = shallowRef(false);
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    return () =>
      replacement.value ? (
        <Box key="second" ref={target} width={7} height={2} />
      ) : (
        <Box key="first" ref={target} width={3} height={1} />
      );
  });

  const result = await render(App, { columns: 10, rows: 3 });
  try {
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 3, height: 1, hasMeasured: true });
    replacement.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 7, height: 2, hasMeasured: true });
  } finally {
    result.dispose();
  }
});

test("a retained size becomes null when its setup scope is disposed", async () => {
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    return () => <Box ref={target} width={3} height={1} />;
  });

  const result = await render(App, { columns: 10, rows: 3 });
  expect({
    width: metrics.width.value,
    height: metrics.height.value,
    hasMeasured: metrics.hasMeasured.value,
  }).toEqual({ width: 3, height: 1, hasMeasured: true });
  result.dispose();
  expect(metrics.hasMeasured.value).toBe(false);
  expect(metrics.width.value).toBe(0);
  expect(metrics.height.value).toBe(0);
});

test("publishes accepted Box size for a visual non-TTY document host", async () => {
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    return () => <Box ref={target} width={6} height={2} />;
  });

  const result = await render(App, {
    columns: 30,
    rows: 8,
    host: { stdout: "stream" },
  });
  try {
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 6, height: 2, hasMeasured: true });
  } finally {
    result.dispose();
  }
});

test("retains accepted size while suspended and settles queued changes on resume", async () => {
  const width = shallowRef(4);
  const visible = shallowRef(true);
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    return () => (visible.value ? <Box ref={target} width={width.value} height={1} /> : null);
  });

  const result = await render(App, { columns: 20, rows: 4 });
  try {
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 4, height: 1, hasMeasured: true });
    const snapshot = () => ({
      width: metrics.width.value,
      height: metrics.height.value,
      left: metrics.left.value,
      top: metrics.top.value,
      hasMeasured: metrics.hasMeasured.value,
    });
    const accepted = snapshot();

    await result.terminal.suspend();
    width.value = 7;
    await nextTick();
    // Pending suspension retains the last accepted metrics.
    expect(snapshot()).toEqual(accepted);

    await result.terminal.resume();
    expect(snapshot()).toEqual({
      width: 7,
      height: 1,
      left: accepted.left,
      top: accepted.top,
      hasMeasured: true,
    });

    await result.terminal.suspend();
    const resized = snapshot();
    visible.value = false;
    await nextTick();
    expect(snapshot()).toEqual(resized);

    await result.terminal.resume();
    expect(metrics.hasMeasured.value).toBe(false);
    expect(metrics.width.value).toBe(0);
    expect(metrics.height.value).toBe(0);
  } finally {
    result.dispose();
  }
});

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
        liveUpdates: true,
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
        liveUpdates: true,
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
          liveUpdates: true,
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
