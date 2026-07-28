import { defineComponent, h, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import stripAnsi from "strip-ansi";
import { createApp, Text, useApp } from "@vue-tui/runtime";
import { createInternalMountOptions } from "../../../../../packages/runtime/dist/internal.mjs";
import { makeFakeStdin } from "../test-streams.ts";
import { captureStream, makeWritable } from "./harness.ts";

test.each([1, 4])(
  "a %i-column one-row Inline error exit writes a durable stderr error",
  async (columns) => {
    const marker = `NARROW_FATAL_${columns}`;
    const fatal = new Error(marker);
    const stdout = makeWritable({ isTTY: true, columns, rows: 1 });
    const stderr = makeWritable({ isTTY: true, columns, rows: 1 });
    const stderrCapture = captureStream(stderr);
    const { stream: stdin } = makeFakeStdin();
    let exit!: (error?: Error) => void;
    const App = defineComponent(() => {
      exit = useApp().exit;
      return () => h(Text, null, { default: () => "running" });
    });
    const app = createApp(App);

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

    try {
      exit(fatal);
      await expect(app.waitUntilExit()).rejects.toBe(fatal);
      const durableError = stripAnsi(stderrCapture.chunks.join(""));
      expect(durableError).toContain(marker);
      expect(durableError.split(marker)).toHaveLength(2);
    } finally {
      stdin.destroy();
      stdout.destroy();
      stderr.destroy();
    }
  },
);

test("a throttled Inline error exit remains durable when stdout is lost before teardown", async () => {
  const marker = "THROTTLED_INLINE_STDOUT_LOST";
  const fatal = new Error(marker);
  let exit!: (error?: Error) => void;
  const App = defineComponent(() => {
    exit = useApp().exit;
    return () => h(Text, null, { default: () => "initial" });
  });
  const stdout = makeWritable({ isTTY: true, columns: 80, rows: 24 });
  const stderr = makeWritable({ isTTY: true, columns: 80, rows: 24 });
  const stdoutCapture = captureStream(stdout);
  const stderrCapture = captureStream(stderr);
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(App);
  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      mode: "inline",
      patchConsole: false,
      maxFps: 1,
    }),
  );

  try {
    await nextTick();
    await app.waitUntilRenderFlush();
    const exited = app.waitUntilExit();

    exit(fatal);
    stdout.destroy();
    app.unmount();

    await expect(exited).rejects.toBe(fatal);
    expect(stripAnsi(stdoutCapture.chunks.join(""))).not.toContain(marker);
    const durableError = stripAnsi(stderrCapture.chunks.join(""));
    expect(durableError).toContain(marker);
    expect(durableError.split(marker)).toHaveLength(2);
  } finally {
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("an Inline frame-write failure is reported durably to stderr", async () => {
  const marker = "INLINE_FRAME_WRITE_FAILED";
  const value = shallowRef("initial");
  const writeFailure = new Error(marker);
  const App = defineComponent(() => () => h(Text, null, { default: () => value.value }));
  const stdout = makeWritable({ isTTY: true, columns: 80, rows: 24 });
  const stderr = makeWritable({ isTTY: true, columns: 80, rows: 24 });
  const stderrCapture = captureStream(stderr);
  const originalWrite = stdout.write.bind(stdout);
  let failNextFrame = false;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    if (failNextFrame && stripAnsi(chunk).includes("updated")) {
      failNextFrame = false;
      throw writeFailure;
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(App);
  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      mode: "inline",
      patchConsole: false,
      maxFps: 1,
    }),
  );

  try {
    await app.waitUntilRenderFlush();
    const exited = app.waitUntilExit();

    failNextFrame = true;
    value.value = "updated";
    stdout.emit("resize");

    await expect(exited).rejects.toBe(writeFailure);
    const durableError = stripAnsi(stderrCapture.chunks.join(""));
    expect(durableError).toContain(marker);
    expect(durableError.split(marker)).toHaveLength(2);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});
