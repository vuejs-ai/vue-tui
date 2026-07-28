import { INTERNAL_KITTY_KEYBOARD } from "../../../../../packages/runtime/dist/internal.mjs";
import { createInternalMountOptions } from "../../../../../packages/runtime/dist/internal.mjs";
import ansiEscapes from "ansi-escapes";
import stripAnsi from "strip-ansi";
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text, createApp, useInput } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { render } from "@vue-tui/testing";
import { makeFakeStdin } from "../../lifecycle/test-streams.ts";
import { countOccurrences, makeOutput, makeTrackedInput } from "./harness.ts";

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
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        mode: "inline",
        patchConsole: false,
        maxFps: 0,
      }),
    );
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
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        mode: "inline",
        patchConsole: false,
      }),
    );
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
      app.mount(
        createInternalMountOptions({
          stdout,
          stderr,
          stdin,
          mode: "fullscreen",
          patchConsole: false,
          maxFps: 0,
        }),
      );
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
      app.mount(
        createInternalMountOptions({
          stdout,
          stderr,
          stdin,
          mode: "fullscreen",
          patchConsole: false,
          maxFps: 0,
          [INTERNAL_KITTY_KEYBOARD]: { mode: "enabled" },
        }),
      );
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
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        mode: "fullscreen",
        patchConsole: false,
        maxFps: 0,
      }),
    );
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
  const result = await render(App, { mode: "fullscreen" });

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
