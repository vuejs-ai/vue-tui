import { PassThrough } from "node:stream";
import { defineComponent, isReadonly, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, createApp, Text, useBoxSize, type BoxSize } from "@vue-tui/runtime";

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
    let size!: ReturnType<typeof useBoxSize>;
    const stable = shallowRef("one");
    const App = defineComponent(() => {
      const target = shallowRef<InstanceType<typeof Box> | null>(null);
      size = useBoxSize(target);
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
      expect(size.value).toEqual({ width: 4, height: 2 });
      expect(isReadonly(size)).toBe(true);
      expect(Object.isFrozen(size.value)).toBe(true);

      const accepted = size.value;
      stable.value = "two";
      await nextTick();
      await result.waitUntilRenderFlush();
      expect(size.value).toBe(accepted);
    } finally {
      result.dispose();
    }
  },
);

test("updates after sibling-driven reflow and terminal resize without rerendering the Box", async () => {
  const sibling = shallowRef("one");
  let targetRenders = 0;
  let size!: ReturnType<typeof useBoxSize>;
  const StableTarget = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    size = useBoxSize(target);
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
    expect(size.value).toEqual({ width: 100, height: 2 });
    expect(targetRenders).toBe(1);

    sibling.value = "one\ntwo\nthree";
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(size.value).toEqual({ width: 100, height: 2 });
    expect(targetRenders).toBe(1);

    await result.terminal.resize(60, 10);
    expect(size.value).toEqual({ width: 60, height: 2 });
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
  let size!: ReturnType<typeof useBoxSize>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    size = useBoxSize(target);
    return () =>
      visible.value ? (
        <Box width={5} height={1} overflowY="hidden">
          <Box
            ref={target}
            display={hidden.value ? "none" : "flex"}
            position={clipped.value ? "absolute" : undefined}
            top={clipped.value ? 2 : undefined}
            width={zero.value ? 0 : 3}
            height={zero.value ? 0 : 1}
          />
        </Box>
      ) : null;
  });

  const result = await render(App, { columns: 10, rows: 3 });
  try {
    expect(size.value).toEqual({ width: 0, height: 0 });

    zero.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(size.value).toEqual({ width: 3, height: 1 });

    clipped.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(size.value).toEqual({ width: 3, height: 1 });

    hidden.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(size.value).toBeNull();

    hidden.value = false;
    clipped.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(size.value).toEqual({ width: 3, height: 1 });

    visible.value = false;
    await nextTick();
    expect(size.value).toBeNull();
  } finally {
    result.dispose();
  }
});

test("clears a previous size while a replacement Box awaits accepted paint", async () => {
  const replacement = shallowRef(false);
  let size!: ReturnType<typeof useBoxSize>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    size = useBoxSize(target);
    return () =>
      replacement.value ? (
        <Box key="second" ref={target} width={7} height={2} />
      ) : (
        <Box key="first" ref={target} width={3} height={1} />
      );
  });

  const result = await render(App, { columns: 10, rows: 3 });
  try {
    expect(size.value).toEqual({ width: 3, height: 1 });
    replacement.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(size.value).toEqual({ width: 7, height: 2 });
  } finally {
    result.dispose();
  }
});

test("returns null when visual Box geometry is unavailable", async () => {
  let size!: Readonly<{ value: BoxSize | null }>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    size = useBoxSize(target);
    return () => (
      <Box ref={target} width={4} height={1}>
        <Text>linear transcript</Text>
      </Box>
    );
  });

  const result = await render(App, {
    columns: 20,
    rows: 4,
    host: { presentation: "screen-reader" },
  });
  try {
    expect(size.value).toBeNull();
  } finally {
    result.dispose();
  }
});

test("a retained size becomes null when its setup scope is disposed", async () => {
  let size!: ReturnType<typeof useBoxSize>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    size = useBoxSize(target);
    return () => <Box ref={target} width={3} height={1} />;
  });

  const result = await render(App, { columns: 10, rows: 3 });
  expect(size.value).toEqual({ width: 3, height: 1 });
  result.dispose();
  expect(size.value).toBeNull();
});

test.each(["live", "at-teardown"] as const)(
  "publishes accepted Box size for a visual non-TTY %s document host",
  async (updates) => {
    let size!: ReturnType<typeof useBoxSize>;
    const App = defineComponent(() => {
      const target = shallowRef<InstanceType<typeof Box> | null>(null);
      size = useBoxSize(target);
      return () => <Box ref={target} width={6} height={2} />;
    });

    const result = await render(App, {
      columns: 30,
      rows: 8,
      host: { stdout: "stream", updates },
    });
    try {
      expect(size.value).toEqual({ width: 6, height: 2 });
    } finally {
      result.dispose();
    }
  },
);

test("retains accepted size while suspended and settles queued changes on resume", async () => {
  const width = shallowRef(4);
  const visible = shallowRef(true);
  let size!: ReturnType<typeof useBoxSize>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    size = useBoxSize(target);
    return () => (visible.value ? <Box ref={target} width={width.value} height={1} /> : null);
  });

  const result = await render(App, { columns: 20, rows: 4 });
  try {
    expect(size.value).toEqual({ width: 4, height: 1 });
    const accepted = size.value;

    await result.terminal.suspend();
    width.value = 7;
    await nextTick();
    expect(size.value).toBe(accepted);

    await result.terminal.resume();
    expect(size.value).toEqual({ width: 7, height: 1 });

    await result.terminal.suspend();
    const resized = size.value;
    visible.value = false;
    await nextTick();
    expect(size.value).toBe(resized);

    await result.terminal.resume();
    expect(size.value).toBeNull();
  } finally {
    result.dispose();
  }
});

test("does not publish a candidate Box size before a failed output write is accepted", async () => {
  const width = shallowRef(4);
  const marker = shallowRef("ready");
  let size!: ReturnType<typeof useBoxSize>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    size = useBoxSize(target);
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
  const injected = new Error("injected Box-size frame failure");
  let sizeDuringFailure: BoxSize | null | undefined;
  let failNextFrameWrite = false;
  stdout.write = ((...args: unknown[]) => {
    if (failNextFrameWrite) {
      failNextFrameWrite = false;
      sizeDuringFailure = size.value;
      throw injected;
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  const app = createApp(App);
  try {
    app.mount({ stdout, stderr, stdin, liveUpdates: true, maxFps: 0, patchConsole: false });
    await app.waitUntilRenderFlush();
    const accepted = size.value;
    expect(accepted).toEqual({ width: 4, height: 1 });

    const exited = app.waitUntilExit();
    width.value = 7;
    marker.value = "FAILED_SIZE_FRAME";
    failNextFrameWrite = true;
    stdout.columns = 19;
    stdout.emit("resize");

    await expect(exited).rejects.toBe(injected);
    expect(sizeDuringFailure).toBe(accepted);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("rejects non-Box targets and use outside a vue-tui tree", async () => {
  expect(() => useBoxSize(shallowRef<InstanceType<typeof Box> | null>(null))).toThrow(
    "render session is unavailable outside a vue-tui render tree",
  );

  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    useBoxSize(target);
    return () => <Text ref={target}>wrong target</Text>;
  });
  const stdout = makeTtyOutput();
  const stderr = makeTtyOutput();
  const stdin = makeTtyInput();
  const app = createApp(App);
  try {
    app.mount({ stdout, stderr, stdin, liveUpdates: true, maxFps: 0, patchConsole: false });
    await expect(app.waitUntilExit()).rejects.toThrow(
      "useBoxSize() target must be a ref bound directly to <Box>",
    );
  } finally {
    app.unmount();
    await Promise.allSettled([app.waitUntilExit()]);
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});
