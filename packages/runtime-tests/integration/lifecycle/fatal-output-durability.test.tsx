import { spawn } from "node:child_process";
import { PassThrough, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import ansiEscapes from "ansi-escapes";
import stripAnsi from "strip-ansi";
import { defineComponent, h, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { captureWrites, makeFakeStdin } from "./test-streams.ts";

function captureStream(stream: NodeJS.WriteStream): { readonly chunks: string[] } {
  const chunks: string[] = [];
  (stream as unknown as PassThrough).on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });
  return { chunks };
}

function makeWritable(options: {
  readonly isTTY: boolean;
  readonly columns?: number;
  readonly rows?: number;
}): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, {
    isTTY: options.isTTY,
    columns: options.columns ?? 80,
    rows: options.rows,
  });
  return stream;
}

async function waitFor(predicate: () => boolean, description: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

test("one-row Inline leaves the first component error visible", async () => {
  const marker = "ONE_ROW_FATAL";
  const stdout = makeWritable({ isTTY: true, columns: 80, rows: 1 });
  const stderr = makeWritable({ isTTY: true, columns: 80, rows: 1 });
  const stdoutCapture = captureStream(stdout);
  const { stream: stdin } = makeFakeStdin();
  const Fatal = defineComponent(() => () => {
    throw new Error(marker);
  });

  const app = createApp(Fatal);
  app.mount({
    stdout,
    stderr,
    stdin,
    mode: "inline",
    liveUpdates: true,
    patchConsole: false,
    maxFps: 0,
    exitOnCtrlC: false,
  });

  try {
    await expect(app.waitUntilExit()).rejects.toThrow(marker);

    const retainedOutput = stripAnsi(stdoutCapture.chunks.join(""));
    expect(retainedOutput).toContain("ERROR");
    expect(retainedOutput).toContain(marker);
  } finally {
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test.each([1, 4])(
  "a %i-column one-row Inline viewport falls back to a durable stderr error",
  async (columns) => {
    const marker = `NARROW_FATAL_${columns}`;
    const stdout = makeWritable({ isTTY: true, columns, rows: 1 });
    const stderr = makeWritable({ isTTY: true, columns, rows: 1 });
    const stdoutCapture = captureStream(stdout);
    const stderrCapture = captureStream(stderr);
    const { stream: stdin } = makeFakeStdin();
    const Fatal = defineComponent(() => () => {
      throw new Error(marker);
    });
    const app = createApp(Fatal);

    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "inline",
      liveUpdates: true,
      patchConsole: false,
      maxFps: 0,
      exitOnCtrlC: false,
    });

    try {
      await expect(app.waitUntilExit()).rejects.toThrow(marker);
      expect(stripAnsi(stderrCapture.chunks.join(""))).toContain(marker);
      expect(
        `${stripAnsi(stdoutCapture.chunks.join(""))}${stripAnsi(stderrCapture.chunks.join(""))}`,
      ).toContain(marker);
    } finally {
      stdin.destroy();
      stdout.destroy();
      stderr.destroy();
    }
  },
);

test("a screen-reader Fullscreen request leaves its fatal transcript on the main screen", async () => {
  const marker = "SCREEN_READER_FATAL";
  const stdout = makeWritable({ isTTY: true, columns: 80, rows: 24 });
  const stderr = makeWritable({ isTTY: true, columns: 80, rows: 24 });
  const stdoutCapture = captureStream(stdout);
  const stderrCapture = captureStream(stderr);
  const { stream: stdin } = makeFakeStdin();
  const Fatal = defineComponent(() => () => {
    throw new Error(marker);
  });
  const app = createApp(Fatal);

  app.mount({
    stdout,
    stderr,
    stdin,
    mode: "fullscreen",
    isScreenReaderEnabled: true,
    liveUpdates: true,
    patchConsole: false,
    maxFps: 0,
    exitOnCtrlC: false,
  });

  try {
    await expect(app.waitUntilExit()).rejects.toThrow(marker);
    const output = stdoutCapture.chunks.join("");
    expect(output).not.toContain(ansiEscapes.enterAlternativeScreen);
    expect(stripAnsi(output)).toContain(marker);
    expect(stripAnsi(stderrCapture.chunks.join(""))).not.toContain(marker);
  } finally {
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("a throttled Inline boundary error falls back to stderr when stdout is lost before paint", async () => {
  const marker = "THROTTLED_INLINE_STDOUT_LOST";
  const trigger = shallowRef(false);
  const fatal = new Error(marker);
  const App = defineComponent(() => () => {
    if (trigger.value) throw fatal;
    return h(Text, null, { default: () => "initial" });
  });
  const stdout = makeWritable({ isTTY: true, columns: 80, rows: 24 });
  const stderr = makeWritable({ isTTY: true, columns: 80, rows: 24 });
  const stdoutCapture = captureStream(stdout);
  const stderrCapture = captureStream(stderr);
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(App);
  app.mount({
    stdout,
    stderr,
    stdin,
    mode: "inline",
    liveUpdates: true,
    patchConsole: false,
    maxFps: 1,
    exitOnCtrlC: false,
  });

  try {
    await nextTick();
    await app.waitUntilRenderFlush();
    const exited = app.waitUntilExit();

    trigger.value = true;
    await nextTick();
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

test("an Inline boundary error falls back to stderr when its first frame write throws", async () => {
  const marker = "INLINE_ERROR_FRAME_WRITE_FAILED";
  const trigger = shallowRef(false);
  const fatal = new Error(marker);
  const App = defineComponent(() => () => {
    if (trigger.value) throw fatal;
    return h(Text, null, { default: () => "initial" });
  });
  const stdout = makeWritable({ isTTY: true, columns: 80, rows: 24 });
  const stderr = makeWritable({ isTTY: true, columns: 80, rows: 24 });
  const stderrCapture = captureStream(stderr);
  const originalWrite = stdout.write.bind(stdout);
  let failErrorFrame = false;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    if (failErrorFrame && stripAnsi(chunk).includes(marker)) {
      failErrorFrame = false;
      throw new Error("injected error-frame write failure");
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(App);
  app.mount({
    stdout,
    stderr,
    stdin,
    mode: "inline",
    liveUpdates: true,
    patchConsole: false,
    // Keep the normal error repaint pending so the resize render barrier below
    // owns the first physical attempt after Vue produces the overview.
    maxFps: 1,
    exitOnCtrlC: false,
  });

  try {
    await app.waitUntilRenderFlush();
    const exited = app.waitUntilExit();

    failErrorFrame = true;
    trigger.value = true;
    stdout.emit("resize");

    await expect(exited).rejects.toBe(fatal);
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

interface FinalStreamFatalResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly stderrFatalWrites: number;
  readonly error: unknown;
}

async function runFinalStreamUpdateFatal(): Promise<FinalStreamFatalResult> {
  const marker = "FINAL_STREAM_FATAL";
  const trigger = shallowRef(false);
  const fatal = new Error(marker);
  const App = defineComponent(() => () => {
    if (trigger.value) throw fatal;
    return h(Text, null, { default: () => "STALE_SUCCESS_FRAME" });
  });
  const stdout = makeWritable({ isTTY: false, columns: 80 });
  const stderr = makeWritable({ isTTY: false, columns: 80 });
  const stdoutCapture = captureStream(stdout);
  const stderrCapture = captureStream(stderr);
  const stderrWrites = captureWrites(stderr);
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(App);
  app.mount({
    stdout,
    stderr,
    stdin,
    liveUpdates: false,
    patchConsole: false,
    // Keep a long throttle window active after the successful leading commit.
    // The error update is then pending when teardown cancels the scheduler, so
    // this exercises whether fatal final-output can replay that prior success.
    maxFps: 1,
    exitOnCtrlC: false,
  });

  await nextTick();
  await app.waitUntilRenderFlush();

  const exited = app.waitUntilExit().then(
    () => ({ kind: "resolved" as const, error: undefined }),
    (error: unknown) => ({ kind: "rejected" as const, error }),
  );
  trigger.value = true;
  await nextTick();
  const outcome = await exited;

  expect(outcome.kind).toBe("rejected");
  expect(outcome.error).toBe(fatal);

  const result = {
    stdout: stdoutCapture.chunks.join(""),
    stderr: stderrCapture.chunks.join(""),
    stderrFatalWrites: stderrWrites.filter((write) => stripAnsi(write).includes(marker)).length,
    error: outcome.error,
  };
  stdin.destroy();
  stdout.destroy();
  stderr.destroy();
  return result;
}

test("final-output fatal exit does not emit the stale successful dynamic frame", async () => {
  const result = await runFinalStreamUpdateFatal();

  expect(stripAnsi(result.stdout).includes("STALE_SUCCESS_FRAME")).toBe(false);
});

test("final-output fatal exit writes one durable error to stderr", async () => {
  const result = await runFinalStreamUpdateFatal();
  const plainStderr = stripAnsi(result.stderr);

  expect(plainStderr).toContain("FINAL_STREAM_FATAL");
  expect(result.stderrFatalWrites).toBe(1);
  expect(result.stderr.endsWith("\n")).toBe(true);
});

test("Fullscreen waits for stdout restoration and the durable stderr callback before rejecting", async () => {
  const marker = "ORDERED_FULLSCREEN_FATAL";
  const fatal = new Error(marker);
  const trace: Array<{ readonly stream: "stdout" | "stderr"; readonly data: string }> = [];
  let releaseRestoreWrite: (() => void) | undefined;
  let releaseErrorWrite: (() => void) | undefined;

  const stdout = new Writable({
    write(chunk: string | Uint8Array, _encoding, callback) {
      const data = chunk.toString();
      trace.push({ stream: "stdout", data });
      if (!releaseRestoreWrite && data.includes(ansiEscapes.exitAlternativeScreen)) {
        let released = false;
        releaseRestoreWrite = () => {
          if (released) return;
          released = true;
          callback();
        };
        return;
      }
      callback();
    },
  }) as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { isTTY: true, columns: 80, rows: 24 });

  const stderr = new Writable({
    write(chunk: string | Uint8Array, _encoding, callback) {
      const data = chunk.toString();
      trace.push({ stream: "stderr", data });
      if (!releaseErrorWrite && stripAnsi(data).includes(marker)) {
        let released = false;
        releaseErrorWrite = () => {
          if (released) return;
          released = true;
          callback();
        };
        return;
      }
      callback();
    },
  }) as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { isTTY: true, columns: 80, rows: 24 });

  const { stream: stdin } = makeFakeStdin();
  const Fatal = defineComponent(() => () => {
    throw fatal;
  });
  const app = createApp(Fatal);
  app.mount({
    stdout,
    stderr,
    stdin,
    mode: "fullscreen",
    liveUpdates: true,
    patchConsole: false,
    maxFps: 0,
    exitOnCtrlC: false,
  });

  let settlement: "pending" | "resolved" | "rejected" = "pending";
  const exited = app.waitUntilExit().then(
    (value) => {
      settlement = "resolved";
      return { kind: "resolved" as const, value };
    },
    (error: unknown) => {
      settlement = "rejected";
      return { kind: "rejected" as const, error };
    },
  );

  try {
    await waitFor(() => releaseRestoreWrite !== undefined, "the alternate-screen restore write");
    expect(settlement).toBe("pending");
    expect(trace.some((entry) => entry.stream === "stderr" && entry.data.includes(marker))).toBe(
      false,
    );

    releaseRestoreWrite?.();
    await waitFor(
      () => releaseErrorWrite !== undefined || settlement !== "pending",
      "the durable stderr write",
    );

    expect(releaseErrorWrite).toBeDefined();
    expect(settlement).toBe("pending");

    const restoreIndex = trace.findIndex(
      (entry) =>
        entry.stream === "stdout" && entry.data.includes(ansiEscapes.exitAlternativeScreen),
    );
    const errorIndex = trace.findIndex(
      (entry) => entry.stream === "stderr" && stripAnsi(entry.data).includes(marker),
    );
    expect(restoreIndex).toBeGreaterThanOrEqual(0);
    expect(errorIndex).toBeGreaterThan(restoreIndex);

    releaseErrorWrite?.();
    const outcome = await exited;
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") expect(outcome.error).toBe(fatal);
  } finally {
    releaseRestoreWrite?.();
    releaseErrorWrite?.();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("final-output survives natural event-loop drain without waitUntilExit", async () => {
  const fixture = fileURLToPath(
    new URL("../subprocess-fixtures/final-output-event-loop-drain.mjs", import.meta.url),
  );
  const child = spawn(process.execPath, [fixture], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env: { ...process.env, CI: "false", FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exit = await new Promise<{
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });

  expect(exit).toEqual({ code: 0, signal: null });
  expect(stderr).toBe("");
  expect(stdout.includes("FINAL_OUTPUT_TAIL_MARKER")).toBe(true);
  expect(stdout.split("FINAL_OUTPUT_TAIL_MARKER")).toHaveLength(2);
}, 15_000);
