import { PassThrough } from "node:stream";
import { INTERNAL_KITTY_KEYBOARD } from "../../../runtime/dist/internal.mjs";
import type { InternalMountOptions } from "../../../runtime/dist/internal.mjs";
import ansiEscapes from "ansi-escapes";
import stripAnsi from "strip-ansi";
import { defineComponent, nextTick, ref, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text, createApp, useInput } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { render, type ContentFrame } from "@vue-tui/testing";
import { useStdout } from "../../../runtime/dist/internal.mjs";
import { makeFakeStdin } from "../lifecycle/test-streams.ts";

function makeOutput(options: { readonly isTTY: boolean }): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: options.isTTY, columns: 80, rows: 24 });
  return stream;
}

function makeTrackedInput(): {
  readonly stream: NodeJS.ReadStream & { isRaw: boolean };
  readonly rawModeCalls: boolean[];
  readonly refBalance: () => number;
} {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream & { isRaw: boolean };
  const rawModeCalls: boolean[] = [];
  let refs = 0;
  Object.assign(stream, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, mode: boolean) {
      this.isRaw = mode;
      rawModeCalls.push(mode);
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
    ref() {
      refs++;
    },
    unref() {
      refs--;
    },
  });
  return { stream, rawModeCalls, refBalance: () => refs };
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
    options: { mode: "inline", liveUpdates: true } satisfies Partial<InternalMountOptions>,
  },
  {
    name: "final non-TTY",
    isTTY: false,
    options: { mode: "inline", liveUpdates: false } satisfies Partial<InternalMountOptions>,
  },
  {
    name: "live non-TTY",
    isTTY: false,
    options: { mode: "inline", liveUpdates: true } satisfies Partial<InternalMountOptions>,
  },
] as const;

test.each(acceptanceHosts)(
  "a normally returned backpressured Static write commits once on $name",
  async ({ name, isTTY, options }) => {
    const marker = `STATIC_FALSE_${name.replaceAll(" ", "_")}`;
    const live = shallowRef("live-1");
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Static>
          <Text>{marker}</Text>
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
        queueMicrotask(() => stdout.emit("drain"));
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
      } as InternalMountOptions);
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

test("an initially output-free Static appends when it later emits on final non-TTY output", async () => {
  const ready = shallowRef(false);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static>
        <Text>{ready.value ? "HISTORY" : ""}</Text>
      </Static>
      <Text>[live]</Text>
    </Box>
  ));
  const stdout = makeOutput({ isTTY: false });
  const stderr = makeOutput({ isTTY: false });
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
      liveUpdates: false,
      patchConsole: false,
      maxFps: 0,
    } as InternalMountOptions);
    await app.waitUntilRenderFlush();
    expect(chunks).toEqual([]);

    ready.value = true;
    await nextTick();
    await app.waitUntilRenderFlush();
    expect(chunks.join("")).toBe("HISTORY\n");

    app.unmount();
    await app.waitUntilExit();
    expect(chunks.join("")).toBe("HISTORY\n[live]\n");
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("a visual Inline Static remains open after a ready sibling commits", async () => {
  const ready = shallowRef(false);
  const Deferred = defineComponent(() => () => <Text>{ready.value ? "DEFERRED_TTY" : ""}</Text>);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static key="deferred">
        <Deferred />
      </Static>
      <Static key="immediate">
        <Text>IMMEDIATE_TTY</Text>
      </Static>
      <Text>[live]</Text>
    </Box>
  ));
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  stdout.rows = 8;
  stdout.write("PRE_APP_HISTORY\n");
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
      patchConsole: false,
    } as InternalMountOptions);
    await app.waitUntilRenderFlush();
    expect(countOccurrences(stripAnsi(chunks.join("")), "IMMEDIATE_TTY")).toBe(1);
    expect(countOccurrences(stripAnsi(chunks.join("")), "DEFERRED_TTY")).toBe(0);

    ready.value = true;
    await nextTick();
    await app.waitUntilRenderFlush();
    expect(countOccurrences(stripAnsi(chunks.join("")), "DEFERRED_TTY")).toBe(1);
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("effective visual Fullscreen rejects empty Static before terminal ownership or a frame", async () => {
  const dynamicMarker = "FULLSCREEN_DYNAMIC_MUST_NOT_RENDER";
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static />
      <Text>{dynamicMarker}</Text>
    </Box>
  ));
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk.toString()));
  stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk.toString()));
  const app = createApp(App);
  const exited = app.waitUntilExit();

  try {
    let mountError: unknown;
    try {
      app.mount({
        stdout,
        stderr,
        stdin,
        mode: "fullscreen",
        liveUpdates: true,
        patchConsole: false,
        maxFps: 0,
      } as InternalMountOptions);
    } catch (error) {
      mountError = error;
    }
    expect(mountError).toMatchObject({
      message: expect.stringContaining(
        "<Static> cannot render on an effective visual Fullscreen surface",
      ),
    });

    await expect(exited).rejects.toBe(mountError);
    expect(stdoutChunks).toEqual([]);
    expect(stripAnsi(stderrChunks.join(""))).toContain(
      "<Static> cannot render on an effective visual Fullscreen surface",
    );
    expect(stderrChunks.join("")).not.toContain("output is not retained in fullscreen mode");
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("visual Fullscreen rolls back setup-owned input before reporting Static rejection", async () => {
  const dynamicMarker = "ACQUIRED_FULLSCREEN_FRAME_MUST_NOT_RENDER";
  const App = defineComponent(() => {
    useInput(() => {});
    return () => (
      <Box flexDirection="column">
        <Static />
        <Text>{dynamicMarker}</Text>
      </Box>
    );
  });
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin, rawModeCalls, refBalance } = makeTrackedInput();
  const events: Array<{ readonly stream: "stdout" | "stderr"; readonly data: string }> = [];
  stdout.on("data", (chunk: Buffer) => events.push({ stream: "stdout", data: chunk.toString() }));
  stderr.on("data", (chunk: Buffer) => events.push({ stream: "stderr", data: chunk.toString() }));
  const app = createApp(App);
  const exited = app.waitUntilExit();

  try {
    let mountError: unknown;
    try {
      app.mount({
        stdout,
        stderr,
        stdin,
        mode: "fullscreen",
        liveUpdates: true,
        patchConsole: false,
        maxFps: 0,
        [INTERNAL_KITTY_KEYBOARD]: { mode: "enabled" },
      } as InternalMountOptions);
    } catch (error) {
      mountError = error;
    }
    expect(mountError).toMatchObject({
      message: expect.stringContaining(
        "<Static> cannot render on an effective visual Fullscreen surface",
      ),
    });

    await expect(exited).rejects.toBe(mountError);

    const output = events
      .filter((event) => event.stream === "stdout")
      .map((event) => event.data)
      .join("");
    const enterIndex = output.indexOf(ansiEscapes.enterAlternativeScreen);
    const exitIndex = output.lastIndexOf(ansiEscapes.exitAlternativeScreen);
    const kittyEnableIndex = output.indexOf("\x1b[>1u");
    const kittyDisableIndex = output.lastIndexOf("\x1b[<u");
    const pasteEnableIndex = output.indexOf("\x1b[?2004h");
    const pasteDisableIndex = output.lastIndexOf("\x1b[?2004l");
    const showCursorIndex = output.lastIndexOf("\x1b[?25h");
    expect(enterIndex).toBeGreaterThanOrEqual(0);
    expect(exitIndex).toBeGreaterThan(enterIndex);
    expect(kittyEnableIndex).toBeGreaterThan(enterIndex);
    expect(kittyDisableIndex).toBeGreaterThan(kittyEnableIndex);
    expect(pasteEnableIndex).toBeGreaterThan(kittyEnableIndex);
    expect(pasteDisableIndex).toBeGreaterThan(pasteEnableIndex);
    expect(showCursorIndex).toBeGreaterThan(exitIndex);
    expect(output).not.toContain(dynamicMarker);
    expect(output).not.toContain("output is not retained in fullscreen mode");
    expect(rawModeCalls).toEqual([true, false]);
    expect(stdin.isRaw).toBe(false);
    expect(stdin.listenerCount("data")).toBe(0);
    expect(refBalance()).toBe(0);

    const restoreEvent = events.findLastIndex(
      (event) =>
        event.stream === "stdout" && event.data.includes(ansiEscapes.exitAlternativeScreen),
    );
    const reportEvent = events.findIndex(
      (event) =>
        event.stream === "stderr" &&
        stripAnsi(event.data).includes(
          "<Static> cannot render on an effective visual Fullscreen surface",
        ),
    );
    expect(reportEvent).toBeGreaterThan(restoreEvent);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("inserting Static after a Fullscreen frame rejects before any replacement frame", async () => {
  const showStatic = shallowRef(false);
  const live = shallowRef("FULLSCREEN_BEFORE_STATIC");
  const staticMarker = "LATE_STATIC_MUST_NOT_RENDER";
  const dynamicMarker = "LATE_FULLSCREEN_FRAME_MUST_NOT_RENDER";
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {showStatic.value ? (
        <Static>
          <Text>{staticMarker}</Text>
        </Static>
      ) : null}
      <Text>{live.value}</Text>
    </Box>
  ));
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  const stdoutChunks: string[] = [];
  const events: Array<{ readonly stream: "stdout" | "stderr"; readonly data: string }> = [];
  stdout.on("data", (chunk: Buffer) => {
    const data = chunk.toString();
    stdoutChunks.push(data);
    events.push({ stream: "stdout", data });
  });
  stderr.on("data", (chunk: Buffer) => events.push({ stream: "stderr", data: chunk.toString() }));
  const app = createApp(App);

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "fullscreen",
      liveUpdates: true,
      patchConsole: false,
      maxFps: 0,
    } as InternalMountOptions);
    await app.waitUntilRenderFlush();
    expect(stdoutChunks.join("")).toContain("FULLSCREEN_BEFORE_STATIC");
    const updateStart = stdoutChunks.length;
    const exited = app.waitUntilExit();

    live.value = dynamicMarker;
    showStatic.value = true;
    await nextTick();
    await expect(exited).rejects.toThrow(
      "<Static> cannot render on an effective visual Fullscreen surface",
    );

    const updateOutput = stdoutChunks.slice(updateStart).join("");
    expect(updateOutput).not.toContain(staticMarker);
    expect(updateOutput).not.toContain(dynamicMarker);
    expect(updateOutput).not.toContain(ansiEscapes.clearViewport);
    expect(updateOutput).toContain(ansiEscapes.exitAlternativeScreen);
    const restoreEvent = events.findLastIndex(
      (event) =>
        event.stream === "stdout" && event.data.includes(ansiEscapes.exitAlternativeScreen),
    );
    const reportEvent = events.findIndex(
      (event) =>
        event.stream === "stderr" &&
        stripAnsi(event.data).includes(
          "<Static> cannot render on an effective visual Fullscreen surface",
        ),
    );
    expect(reportEvent).toBeGreaterThan(restoreEvent);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("Static inserted while Fullscreen is suspended rejects before surface or input reacquisition", async () => {
  const showStatic = shallowRef(false);
  const staticMarker = "SUSPENDED_STATIC_MUST_NOT_RENDER";
  const App = defineComponent(() => {
    useInput(() => {});
    return () => (
      <Box flexDirection="column">
        {showStatic.value ? (
          <Static>
            <Text>{staticMarker}</Text>
          </Static>
        ) : null}
        <Text>FULLSCREEN_BEFORE_SUSPEND</Text>
      </Box>
    );
  });
  const result = await render(App, { host: { mode: "fullscreen" } });

  try {
    expect(result.terminal.rawMode.history).toEqual([true]);
    const framesBeforeSuspend = result.frames.length;
    await result.terminal.suspend();
    expect(result.terminal.rawMode.history).toEqual([true, false]);
    expect((await result.screen()).activeBuffer).toBe("normal");

    showStatic.value = true;
    await nextTick();
    const exited = result.waitUntilExit().then(
      () => ({ kind: "resolved" as const, error: undefined }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    );
    await expect(result.terminal.resume()).rejects.toThrow(
      "<Static> cannot render on an effective visual Fullscreen surface",
    );
    const outcome = await exited;
    expect(outcome.kind).toBe("rejected");
    expect(outcome.error).toBeInstanceOf(Error);
    expect((outcome.error as Error).message).toContain(
      "<Static> cannot render on an effective visual Fullscreen surface",
    );
    expect(result.frames.length).toBe(framesBeforeSuspend);
    expect(result.terminal.rawMode.history).toEqual([true, false]);
    expect(result.terminal.rawMode.current).toBe(false);
    expect((await result.screen()).activeBuffer).toBe("normal");
    expect((await result.screen()).lines.join("\n")).not.toContain(staticMarker);
  } finally {
    result.dispose();
  }
});

test("a synchronous append during the Static write remains pending for the next commit", async () => {
  const first = "STATIC_REENTRANT_FIRST";
  const second = "STATIC_REENTRANT_SECOND";
  const items = ref([{ id: 1, text: first }]);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {items.value.map((item) => (
        <Static key={item.id}>
          <Text>{item.text}</Text>
        </Static>
      ))}
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
      items.value.push({ id: 2, text: second });
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
    } as InternalMountOptions);
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

test("a throwing Static write abandons the instance before a synchronous slot replacement", async () => {
  const first = "STATIC_REENTRANT_WRITTEN";
  const replacement = "STATIC_REENTRANT_REPLACEMENT_MUST_NOT_RENDER";
  const text = ref(first);
  const showStatic = shallowRef(false);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {showStatic.value ? (
        <Static>
          <Text>{text.value}</Text>
        </Static>
      ) : null}
      <Text>live</Text>
    </Box>
  ));
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  const chunks: string[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  const originalWrite = stdout.write.bind(stdout);
  const injected = new Error("injected reentrant Static write failure");
  let replaced = false;
  let firstAttempts = 0;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
    if (chunk.includes(first)) {
      firstAttempts++;
      if (!replaced) {
        replaced = true;
        text.value = replacement;
      }
      throw injected;
    }
    return result;
  }) as NodeJS.WriteStream["write"];
  const app = createApp(App);
  const exited = app.waitUntilExit();

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "inline",
      liveUpdates: true,
      patchConsole: false,
      maxFps: 0,
    } as InternalMountOptions);

    await app.waitUntilRenderFlush();
    showStatic.value = true;
    stdout.columns = 79;
    stdout.emit("resize");

    await expect(exited).rejects.toBe(injected);
    const output = stripAnsi(chunks.join(""));
    expect(replaced).toBe(true);
    expect(firstAttempts).toBe(1);
    expect(countOccurrences(output, first)).toBe(1);
    expect(output).not.toContain(replacement);
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
  const showStatic = shallowRef(false);
  const live = shallowRef("ready");
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {showStatic.value ? (
        <Static>
          <Text>{staticMarker}</Text>
        </Static>
      ) : null}
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
    } as InternalMountOptions);
    await app.waitUntilRenderFlush();
    const exited = app.waitUntilExit();

    failDynamic = true;
    showStatic.value = true;
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
  const showStatic = shallowRef(false);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {showStatic.value ? (
        <Static>
          <Text>{marker}</Text>
        </Static>
      ) : null}
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
    } as InternalMountOptions);
    await app.waitUntilRenderFlush();
    const exited = app.waitUntilExit();

    showStatic.value = true;
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
  const items = shallowRef([{ id: 1, text: "AAAAAAAA" }]);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {items.value.map((item) => (
        <Static key={item.id}>
          <Text>{item.text}</Text>
        </Static>
      ))}
      <Text>live</Text>
    </Box>
  ));
  const result = await render(App, { columns: 8, rows: 6 });

  try {
    await result.waitUntilRenderFlush();
    expect(staticTranscript(result.frames)).toBe("AAAAAAAA\n");

    await result.terminal.resize(4, 6);
    items.value = [...items.value, { id: 2, text: "BBBBBBBB" }];
    await nextTick();
    await result.waitUntilRenderFlush();

    expect(staticTranscript(result.frames)).toBe("AAAAAAAA\nBBBB\nBBBB\n");
  } finally {
    result.dispose();
  }
});

test("Static append waits while suspended and commits once after continuation", async () => {
  const items = shallowRef([{ id: 1, text: "STATIC_BEFORE_SUSPEND" }]);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {items.value.map((item) => (
        <Static key={item.id}>
          <Text>{item.text}</Text>
        </Static>
      ))}
      <Text>live</Text>
    </Box>
  ));
  const result = await render(App, { columns: 40, rows: 8 });

  try {
    await result.waitUntilRenderFlush();
    await result.terminal.suspend();
    const suspendedOffset = result.frames.length;

    items.value = [...items.value, { id: 2, text: "STATIC_DURING_SUSPEND" }];
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
  const items = shallowRef<Array<{ id: number; text: string }>>([]);
  let write: ((data: string) => void) | undefined;
  const App = defineComponent(() => {
    write = useStdout().write;
    return () => (
      <Box flexDirection="column">
        {items.value.map((item) => (
          <Static key={item.id}>
            <Text>{item.text}</Text>
          </Static>
        ))}
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
    } as InternalMountOptions);
    await app.waitUntilRenderFlush();

    items.value = [{ id: 1, text: first }];
    await nextTick();
    await app.waitUntilRenderFlush();
    write?.(`${side}\n`);
    items.value = [...items.value, { id: 2, text: second }];
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
  const showStatic = shallowRef(false);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {showStatic.value ? (
        <Static>
          <Text>{marker}</Text>
        </Static>
      ) : null}
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
    } as InternalMountOptions);
    await app.waitUntilRenderFlush();

    showStatic.value = true;
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
