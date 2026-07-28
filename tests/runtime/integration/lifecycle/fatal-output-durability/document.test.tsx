import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineComponent, h, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import stripAnsi from "strip-ansi";
import { createApp, Text, useApp } from "@vue-tui/runtime";
import {
  createInternalMountOptions,
  nextLineEscape,
} from "../../../../../packages/runtime/dist/internal.mjs";
import { captureWrites, makeFakeStdin } from "../test-streams.ts";
import { captureStream, makeWritable } from "./harness.ts";

function sanitizedChildEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.NO_COLOR;
  delete environment.NODE_DISABLE_COLORS;
  delete environment.FORCE_COLOR;
  delete environment.NODE_NO_WARNINGS;
  return environment;
}

interface FinalStreamFatalResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly stderrFatalWrites: number;
  readonly error: unknown;
}

async function runFinalStreamUpdateFatal(
  options: {
    readonly stderrIsTTY?: boolean;
  } = {},
): Promise<FinalStreamFatalResult> {
  const marker = "FINAL_STREAM_FATAL";
  const fatal = new Error(marker);
  let exit!: (error?: Error) => void;
  const App = defineComponent(() => {
    exit = useApp().exit;
    return () => h(Text, null, { default: () => "STALE_SUCCESS_FRAME" });
  });
  const stdout = makeWritable({ isTTY: false, columns: 80 });
  const stderr = makeWritable({
    isTTY: options.stderrIsTTY ?? false,
    columns: 80,
    rows: options.stderrIsTTY ? 24 : undefined,
  });
  const stdoutCapture = captureStream(stdout);
  const stderrCapture = captureStream(stderr);
  const stderrWrites = captureWrites(stderr);
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(App);
  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      patchConsole: false,
      maxFps: 1,
    }),
  );

  await nextTick();
  await app.waitUntilRenderFlush();

  const exited = app.waitUntilExit().then(
    () => ({ kind: "resolved" as const, error: undefined }),
    (error: unknown) => ({ kind: "rejected" as const, error }),
  );
  exit(fatal);
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

test("document-host fatal output does not emit terminal line controls to a TTY stderr", async () => {
  const result = await runFinalStreamUpdateFatal({ stderrIsTTY: true });

  expect(stripAnsi(result.stderr)).toContain("FINAL_STREAM_FATAL");
  expect(result.stderr).not.toContain(nextLineEscape);
});

test("final-output survives natural event-loop drain without waitUntilExit", async () => {
  const fixture = fileURLToPath(
    new URL("../fixtures/final-output-event-loop-drain.mjs", import.meta.url),
  );
  const child = spawn(process.execPath, [fixture], {
    cwd: fileURLToPath(new URL("../../..", import.meta.url)),
    env: sanitizedChildEnvironment(),
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
