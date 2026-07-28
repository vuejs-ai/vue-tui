import { Writable } from "node:stream";
import ansiEscapes from "ansi-escapes";
import stripAnsi from "strip-ansi";
import { defineComponent, h, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useApp } from "@vue-tui/runtime";
import { createInternalMountOptions } from "../../../../../packages/runtime/dist/internal.mjs";
import { makeFakeStdin } from "../test-streams.ts";
import { makeWritable, waitFor } from "./harness.ts";

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
      mode: "fullscreen",
      patchConsole: false,
      maxFps: 0,
    }),
  );
  await app.waitUntilRenderFlush();

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
  exit(fatal);

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

test("an accepted Fullscreen frame failure restores stdout before rejecting with that error", async () => {
  const marker = "ORDERED_FULLSCREEN_FRAME_FAILURE";
  const failedFrame = "FRAME_THAT_REPORTS_EIO";
  const fatal = Object.assign(new Error(marker), { code: "EIO" });
  const trace: Array<{ readonly stream: "stdout" | "stderr"; readonly data: string }> = [];
  const order: string[] = [];
  let failNextFrame = false;
  let failedFrameAccepted = false;
  let failureCallbackRan = false;
  let releaseRestoreWrite: (() => void) | undefined;
  let releaseErrorWrite: (() => void) | undefined;

  const stdout = makeWritable({ isTTY: true, columns: 80, rows: 24 });
  const originalStdoutWrite = stdout.write.bind(stdout);
  // A callback error permanently poisons Node's built-in Writable state. Keep this borrowed
  // stream observable instead: the failing frame returns true, reports EIO asynchronously, and
  // accepts the later recovery writes. This is deliberately not a closed-PTY-master model.
  stdout.write = ((...args: unknown[]) => {
    const data = String(args[0]);
    const callback =
      typeof args.at(-1) === "function"
        ? (args.at(-1) as (error?: Error | null) => void)
        : undefined;
    trace.push({ stream: "stdout", data });
    if (failNextFrame && stripAnsi(data).includes(failedFrame)) {
      failNextFrame = false;
      failedFrameAccepted = true;
      order.push("frame accepted");
      setImmediate(() => {
        failureCallbackRan = true;
        order.push("frame callback failed");
        callback?.(fatal);
      });
      return true;
    }
    if (!releaseRestoreWrite && data.includes(ansiEscapes.exitAlternativeScreen)) {
      order.push("restore accepted");
      let released = false;
      releaseRestoreWrite = () => {
        if (released) return;
        released = true;
        order.push("restore callback completed");
        callback?.();
      };
      return true;
    }
    return (originalStdoutWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

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
  const value = shallowRef("running");
  const App = defineComponent(() => () => h(Text, null, { default: () => value.value }));
  const app = createApp(App);
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
  failNextFrame = true;
  value.value = failedFrame;

  try {
    await waitFor(() => failedFrameAccepted, "the accepted failing frame");
    await waitFor(() => releaseRestoreWrite !== undefined, "the alternate-screen restore write");
    expect(failureCallbackRan).toBe(true);
    expect(settlement).toBe("pending");
    expect(trace.some((entry) => entry.stream === "stderr" && entry.data.includes(marker))).toBe(
      false,
    );

    const failedFrameIndex = trace.findIndex(
      (entry) => entry.stream === "stdout" && stripAnsi(entry.data).includes(failedFrame),
    );
    const restoreIndex = trace.findIndex(
      (entry) =>
        entry.stream === "stdout" && entry.data.includes(ansiEscapes.exitAlternativeScreen),
    );
    const restoration = trace
      .slice(restoreIndex)
      .filter((entry) => entry.stream === "stdout")
      .map((entry) => entry.data)
      .join("");
    expect(failedFrameIndex).toBeGreaterThanOrEqual(0);
    expect(restoreIndex).toBeGreaterThan(failedFrameIndex);
    expect(restoration).toContain(ansiEscapes.exitAlternativeScreen);
    expect(restoration).toContain(ansiEscapes.cursorShow);
    expect(order).toEqual(["frame accepted", "frame callback failed", "restore accepted"]);

    releaseRestoreWrite?.();
    await waitFor(
      () => releaseErrorWrite !== undefined || settlement !== "pending",
      "the durable stderr write",
    );

    expect(releaseErrorWrite).toBeDefined();
    expect(settlement).toBe("pending");

    const errorIndex = trace.findIndex(
      (entry) => entry.stream === "stderr" && stripAnsi(entry.data).includes(marker),
    );
    expect(errorIndex).toBeGreaterThan(restoreIndex);

    releaseErrorWrite?.();
    const outcome = await exited;
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") expect(outcome.error).toBe(fatal);
    expect(order).toEqual([
      "frame accepted",
      "frame callback failed",
      "restore accepted",
      "restore callback completed",
    ]);
  } finally {
    releaseRestoreWrite?.();
    releaseErrorWrite?.();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});
