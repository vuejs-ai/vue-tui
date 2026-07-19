import { PassThrough } from "node:stream";
import {
  defineComponent,
  h,
  isReadonly,
  nextTick,
  shallowRef,
  vShow,
  watch,
  withDirectives,
} from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, createApp, renderToString, Text, useBoxPresence } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";

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
  "publishes accepted direct Box presence in %s mode",
  async (mode) => {
    let duringSetup: readonly boolean[] | undefined;
    let presences!: readonly ReturnType<typeof useBoxPresence>[];
    const App = defineComponent(() => {
      const zero = shallowRef<InstanceType<typeof Box> | null>(null);
      const clipped = shallowRef<InstanceType<typeof Box> | null>(null);
      const covered = shallowRef<InstanceType<typeof Box> | null>(null);
      const scrolled = shallowRef<InstanceType<typeof Box> | null>(null);
      presences = [
        useBoxPresence(zero),
        useBoxPresence(clipped),
        useBoxPresence(covered),
        useBoxPresence(scrolled),
      ];
      duringSetup = presences.map((presence) => presence.value);
      return () => (
        <Box height={2} overflowY="hidden">
          <Box ref={zero} width={0} height={0} />
          <Box ref={clipped} position="absolute" top={5} width={2} height={1} />
          <Box ref={covered} position="absolute" top={0} width={2} height={1} />
          <Box position="absolute" top={0} width={2} height={1} />
          <Box marginTop={-3}>
            <Box ref={scrolled} width={2} height={1} />
          </Box>
        </Box>
      );
    });

    const result = await render(App, { columns: 20, rows: 4, host: { mode } });
    try {
      expect(duringSetup).toEqual([false, false, false, false]);
      expect(presences.map((presence) => presence.value)).toEqual([true, true, true, true]);
      expect(presences.every((presence) => isReadonly(presence))).toBe(true);
    } finally {
      result.dispose();
      expect(presences.map((presence) => presence.value)).toEqual([false, false, false, false]);
    }
  },
);

test("uses effective self and ancestor display while keeping keyed retarget atomic", async () => {
  const directDisplay = shallowRef<"flex" | "none">("flex");
  const ancestorDisplay = shallowRef<"flex" | "none">("flex");
  const ancestorShown = shallowRef(true);
  const second = shallowRef(false);
  const mounted = shallowRef(true);
  let presence!: ReturnType<typeof useBoxPresence>;
  const changes: boolean[] = [];
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    presence = useBoxPresence(target);
    watch(presence, (value) => changes.push(value), { flush: "sync" });
    return () =>
      withDirectives(
        h(Box, { display: ancestorDisplay.value }, () =>
          mounted.value
            ? h(Box, {
                key: second.value ? "second" : "first",
                ref: target,
                display: directDisplay.value,
                width: 3,
                height: 1,
              })
            : null,
        ),
        [[vShow, ancestorShown.value]],
      );
  });

  const result = await render(App, { columns: 10, rows: 3 });
  try {
    expect(presence.value).toBe(true);
    changes.length = 0;

    second.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(presence.value).toBe(true);
    expect(changes).toEqual([]);

    directDisplay.value = "none";
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(presence.value).toBe(false);

    directDisplay.value = "flex";
    ancestorDisplay.value = "none";
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(presence.value).toBe(false);

    ancestorDisplay.value = "flex";
    ancestorShown.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(presence.value).toBe(false);

    ancestorShown.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(presence.value).toBe(true);

    mounted.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(presence.value).toBe(false);
  } finally {
    result.dispose();
  }
});

test("keeps Box presence for screen-reader and non-TTY live documents", async () => {
  for (const host of [
    { presentation: "screen-reader" as const },
    { stdout: "stream" as const, updates: "live" as const },
    { stdout: "stream" as const, updates: "at-teardown" as const },
  ]) {
    let presence!: ReturnType<typeof useBoxPresence>;
    const App = defineComponent(() => {
      const target = shallowRef<InstanceType<typeof Box> | null>(null);
      presence = useBoxPresence(target);
      return () => <Box ref={target} />;
    });
    const result = await render(App, { columns: 20, rows: 4, host });
    try {
      expect(presence.value).toBe(true);
    } finally {
      result.dispose();
    }
  }
});

test("excludes a Box inside Static from its first accepted candidate", async () => {
  let presence!: ReturnType<typeof useBoxPresence>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    presence = useBoxPresence(target);
    return () => (
      <Static>
        <Box ref={target}>
          <Text>history</Text>
        </Box>
      </Static>
    );
  });
  const result = await render(App);
  try {
    expect(presence.value).toBe(false);
  } finally {
    result.dispose();
  }
});

test("settles a disposed component-scope binding to false", async () => {
  const mounted = shallowRef(true);
  let presence!: ReturnType<typeof useBoxPresence>;
  const Probe = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    presence = useBoxPresence(target);
    return () => <Box ref={target} />;
  });
  const App = defineComponent(() => () => (mounted.value ? <Probe /> : null));

  const result = await render(App);
  try {
    expect(presence.value).toBe(true);
    mounted.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(presence.value).toBe(false);
  } finally {
    result.dispose();
  }
});

test("retains the accepted value while suspended and settles removal after resume", async () => {
  const visible = shallowRef(true);
  let presence!: ReturnType<typeof useBoxPresence>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    presence = useBoxPresence(target);
    return () => (visible.value ? <Box ref={target} /> : null);
  });

  const result = await render(App);
  try {
    expect(presence.value).toBe(true);
    await result.terminal.suspend();
    visible.value = false;
    await nextTick();
    expect(presence.value).toBe(true);
    await result.terminal.resume();
    expect(presence.value).toBe(false);
  } finally {
    result.dispose();
  }
});

test("does not publish candidate removal during a failed output write", async () => {
  const visible = shallowRef(true);
  const marker = shallowRef("ready");
  let presence!: ReturnType<typeof useBoxPresence>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    presence = useBoxPresence(target);
    return () => (
      <Box>
        {visible.value ? <Box ref={target} /> : null}
        <Text>{marker.value}</Text>
      </Box>
    );
  });

  const stdout = makeTtyOutput();
  const stderr = makeTtyOutput();
  const stdin = makeTtyInput();
  const originalWrite = stdout.write.bind(stdout);
  const injected = new Error("injected Box-presence frame failure");
  let presenceDuringFailure: boolean | undefined;
  let failNextFrameWrite = false;
  stdout.write = ((...args: unknown[]) => {
    if (failNextFrameWrite) {
      failNextFrameWrite = false;
      presenceDuringFailure = presence.value;
      throw injected;
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  const app = createApp(App);
  try {
    app.mount({ stdout, stderr, stdin, liveUpdates: true, maxFps: 0, patchConsole: false });
    await app.waitUntilRenderFlush();
    expect(presence.value).toBe(true);

    const exited = app.waitUntilExit();
    visible.value = false;
    marker.value = "FAILED_PRESENCE_FRAME";
    failNextFrameWrite = true;
    stdout.columns = 19;
    stdout.emit("resize");

    await expect(exited).rejects.toBe(injected);
    expect(presenceDuringFailure).toBe(true);
    expect(presence.value).toBe(false);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("is false in string rendering and still validates the assigned target", () => {
  let presence!: ReturnType<typeof useBoxPresence>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    presence = useBoxPresence(target);
    return () => (
      <Box ref={target}>
        <Text>{presence.value ? "present" : "absent"}</Text>
      </Box>
    );
  });
  expect(renderToString(App)).toBe("absent");
  expect(presence.value).toBe(false);

  const Invalid = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    useBoxPresence(target);
    return () => <Text ref={target}>wrong</Text>;
  });
  expect(() => renderToString(Invalid)).toThrow(
    "useBoxPresence() target must be a ref bound directly to <Box>",
  );
});

test("rejects a Box owned by another live app", async () => {
  const foreign = shallowRef<InstanceType<typeof Box> | null>(null);
  const Owner = defineComponent(() => () => <Box ref={foreign} />);
  const Observer = defineComponent(() => {
    useBoxPresence(foreign);
    return () => <Text>observer</Text>;
  });
  const owner = await render(Owner);
  try {
    await expect(render(Observer)).rejects.toThrow(
      "useBoxPresence() target belongs to a different vue-tui app",
    );
  } finally {
    owner.dispose();
  }
});
