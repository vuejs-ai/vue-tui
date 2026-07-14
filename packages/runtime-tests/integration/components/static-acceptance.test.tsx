import { PassThrough } from "node:stream";
import stripAnsi from "strip-ansi";
import { defineComponent, nextTick, ref, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Static, Text, createApp, useStdout, type MountOptions } from "@vue-tui/runtime";
import { render, type ContentFrame } from "@vue-tui/testing";
import { makeFakeStdin } from "../lifecycle/test-streams.ts";

function makeOutput(options: { readonly isTTY: boolean }): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: options.isTTY, columns: 80, rows: 24 });
  return stream;
}

function countOccurrences(value: string, marker: string): number {
  return value.split(marker).length - 1;
}

function staticTranscript(frames: readonly ContentFrame[]): string {
  return frames.map((frame) => frame.staticOutput).join("");
}

const acceptanceHosts = [
  {
    name: "visual Inline",
    isTTY: true,
    options: { mode: "inline", liveUpdates: true } satisfies Partial<MountOptions>,
  },
  {
    name: "screen-reader Inline",
    isTTY: true,
    options: {
      mode: "inline",
      liveUpdates: true,
      isScreenReaderEnabled: true,
    } satisfies Partial<MountOptions>,
  },
  {
    name: "final non-TTY",
    isTTY: false,
    options: { mode: "inline", liveUpdates: false } satisfies Partial<MountOptions>,
  },
  {
    name: "current visual Fullscreen",
    isTTY: true,
    options: { mode: "fullscreen", liveUpdates: true } satisfies Partial<MountOptions>,
  },
] as const;

test.each(acceptanceHosts)(
  "a normally returned backpressured Static write commits once on $name",
  async ({ name, isTTY, options }) => {
    const marker = `STATIC_FALSE_${name.replaceAll(" ", "_")}`;
    const live = shallowRef("live-1");
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Static items={[marker]}>
          {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
        </Static>
        <Text>{live.value}</Text>
      </Box>
    ));
    const stdout = makeOutput({ isTTY });
    const stderr = makeOutput({ isTTY });
    const { stream: stdin } = makeFakeStdin();
    const chunks: string[] = [];
    stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
    const originalWrite = stdout.write.bind(stdout);
    let attempts = 0;
    stdout.write = ((...args: unknown[]) => {
      const chunk = String(args[0]);
      const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
      if (chunk.includes(marker)) {
        attempts++;
        return false;
      }
      return result;
    }) as NodeJS.WriteStream["write"];
    const app = createApp(App);

    try {
      app.mount({
        stdout,
        stderr,
        stdin,
        patchConsole: false,
        maxFps: 0,
        ...options,
      });
      await app.waitUntilRenderFlush();

      live.value = "live-2";
      await nextTick();
      await app.waitUntilRenderFlush();
      app.unmount();
      await app.waitUntilExit();

      expect(attempts).toBe(1);
      expect(countOccurrences(stripAnsi(chunks.join("")), marker)).toBe(1);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
      stderr.destroy();
    }
  },
);

test("a synchronous append during the Static write remains pending for the next commit", async () => {
  const first = "STATIC_REENTRANT_FIRST";
  const second = "STATIC_REENTRANT_SECOND";
  const items = ref<string[]>([first]);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
      </Static>
      <Text>live</Text>
    </Box>
  ));
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  const chunks: string[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  const originalWrite = stdout.write.bind(stdout);
  let appended = false;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
    if (!appended && chunk.includes(first)) {
      appended = true;
      items.value.push(second);
    }
    return result;
  }) as NodeJS.WriteStream["write"];
  const app = createApp(App);

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "inline",
      liveUpdates: true,
      patchConsole: false,
      maxFps: 0,
    });
    await nextTick();
    await app.waitUntilRenderFlush();
    app.unmount();
    await app.waitUntilExit();

    const output = stripAnsi(chunks.join(""));
    expect(appended).toBe(true);
    expect(countOccurrences(output, first)).toBe(1);
    expect(countOccurrences(output, second)).toBe(1);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("accepted Static output is not replayed when the later dynamic write throws", async () => {
  const staticMarker = "STATIC_BEFORE_DYNAMIC_FAILURE";
  const dynamicMarker = "DYNAMIC_WRITE_FAILURE";
  const items = shallowRef<string[]>([]);
  const live = shallowRef("ready");
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
      </Static>
      <Text>{live.value}</Text>
    </Box>
  ));
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  const chunks: string[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  const originalWrite = stdout.write.bind(stdout);
  const injected = new Error("injected dynamic write failure");
  let staticAttempts = 0;
  let failDynamic = false;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    if (chunk.includes(staticMarker)) staticAttempts++;
    if (failDynamic && chunk.includes(dynamicMarker)) {
      failDynamic = false;
      throw injected;
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];
  const app = createApp(App);

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "inline",
      liveUpdates: true,
      patchConsole: false,
      maxFps: 0,
    });
    await app.waitUntilRenderFlush();
    const exited = app.waitUntilExit();

    failDynamic = true;
    items.value = [staticMarker];
    live.value = dynamicMarker;
    // Let the resize transaction own the pending Vue update. Its explicit
    // failure path turns the injected writer error into application teardown,
    // which then proves the accepted Static batch is not replayed.
    stdout.columns = 79;
    stdout.emit("resize");

    await expect(exited).rejects.toBe(injected);
    expect(staticAttempts).toBe(1);
    expect(countOccurrences(stripAnsi(chunks.join("")), staticMarker)).toBe(1);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("a throwing Static write is indeterminate and is not retried during teardown", async () => {
  const marker = "STATIC_THROW_NO_RETRY";
  const items = shallowRef<string[]>([]);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
      </Static>
      <Text>live</Text>
    </Box>
  ));
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  const chunks: string[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  const originalWrite = stdout.write.bind(stdout);
  const injected = new Error("injected Static write failure");
  let attempts = 0;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    if (chunk.includes(marker)) {
      attempts++;
      if (attempts === 1) throw injected;
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];
  const app = createApp(App);

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "inline",
      liveUpdates: true,
      patchConsole: false,
      maxFps: 0,
    });
    await app.waitUntilRenderFlush();
    const exited = app.waitUntilExit();

    items.value = [marker];
    stdout.columns = 79;
    stdout.emit("resize");

    await expect(exited).rejects.toBe(injected);
    expect(attempts).toBe(1);
    expect(stripAnsi(chunks.join(""))).not.toContain(marker);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("resize never replays accepted Static output and new items use the new width", async () => {
  const items = shallowRef(["AAAAAAAA"]);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
      </Static>
      <Text>live</Text>
    </Box>
  ));
  const result = await render(App, { columns: 8, rows: 6 });

  try {
    await result.waitUntilRenderFlush();
    expect(staticTranscript(result.frames)).toBe("AAAAAAAA\n");

    await result.terminal.resize(4, 6);
    items.value = ["AAAAAAAA", "BBBBBBBB"];
    await nextTick();
    await result.waitUntilRenderFlush();

    expect(staticTranscript(result.frames)).toBe("AAAAAAAA\nBBBB\nBBBB\n");
  } finally {
    result.dispose();
  }
});

test("Static append waits while suspended and commits once after continuation", async () => {
  const items = shallowRef<string[]>(["STATIC_BEFORE_SUSPEND"]);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
      </Static>
      <Text>live</Text>
    </Box>
  ));
  const result = await render(App, { columns: 40, rows: 8 });

  try {
    await result.waitUntilRenderFlush();
    await result.terminal.suspend();
    const suspendedOffset = result.frames.length;

    items.value = ["STATIC_BEFORE_SUSPEND", "STATIC_DURING_SUSPEND"];
    await nextTick();
    expect(staticTranscript(result.frames.slice(suspendedOffset))).not.toContain(
      "STATIC_DURING_SUSPEND",
    );

    await result.terminal.resume();
    await result.waitUntilRenderFlush();
    const transcript = staticTranscript(result.frames);
    expect(countOccurrences(transcript, "STATIC_BEFORE_SUSPEND")).toBe(1);
    expect(countOccurrences(transcript, "STATIC_DURING_SUSPEND")).toBe(1);
  } finally {
    result.dispose();
  }
});

test("coordinated external output stays ordered between exact Static commits", async () => {
  const first = "STATIC_BEFORE_SIDE_OUTPUT";
  const side = "COORDINATED_SIDE_OUTPUT";
  const second = "STATIC_AFTER_SIDE_OUTPUT";
  const items = shallowRef<string[]>([]);
  let write: ((data: string) => void) | undefined;
  const App = defineComponent(() => {
    write = useStdout().write;
    return () => (
      <Box flexDirection="column">
        <Static items={items.value}>
          {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
        </Static>
        <Text>live</Text>
      </Box>
    );
  });
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  const chunks: string[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  const app = createApp(App);

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "inline",
      liveUpdates: true,
      patchConsole: false,
      maxFps: 0,
    });
    await app.waitUntilRenderFlush();

    items.value = [first];
    await nextTick();
    await app.waitUntilRenderFlush();
    write?.(`${side}\n`);
    items.value = [first, second];
    await nextTick();
    await app.waitUntilRenderFlush();

    const output = stripAnsi(chunks.join(""));
    expect(countOccurrences(output, first)).toBe(1);
    expect(countOccurrences(output, side)).toBe(1);
    expect(countOccurrences(output, second)).toBe(1);
    expect(output.indexOf(first)).toBeLessThan(output.indexOf(side));
    expect(output.indexOf(side)).toBeLessThan(output.indexOf(second));
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("ordinary teardown commits one pending throttled Static append", async () => {
  const marker = "STATIC_PENDING_AT_TEARDOWN";
  const items = shallowRef<string[]>([]);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
      </Static>
      <Text>live</Text>
    </Box>
  ));
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  const chunks: string[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  const app = createApp(App);

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "inline",
      liveUpdates: true,
      patchConsole: false,
      maxFps: 1,
    });
    await app.waitUntilRenderFlush();

    items.value = [marker];
    await nextTick();
    app.unmount();
    await app.waitUntilExit();

    expect(countOccurrences(stripAnsi(chunks.join("")), marker)).toBe(1);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});
