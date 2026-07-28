// Sequential: these tests observe process beforeExit/exit ownership and terminal restoration.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import ansiEscapes from "ansi-escapes";
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { createInternalMountOptions } from "../../../../packages/runtime/dist/internal.mjs";
import { makeRawTrackingStdin, makeTtyWritable } from "./test-streams.ts";

function sanitizedChildEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.NO_COLOR;
  delete environment.NODE_DISABLE_COLORS;
  delete environment.FORCE_COLOR;
  delete environment.NODE_NO_WARNINGS;
  return environment;
}

test.sequential("exit settlement and beforeExit ownership are idempotent after teardown", async () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin } = makeRawTrackingStdin();
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = ((...args: unknown[]) => {
    writes.push(String(args[0]));
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  const beforeExitListeners = new Set(process.listeners("beforeExit"));
  const app = createApp(defineComponent(() => () => <Text>final</Text>));
  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      patchConsole: false,
    }),
  );

  app.unmount();
  app.unmount();
  await app.waitUntilExit();

  const addedBeforeExitListeners = process
    .listeners("beforeExit")
    .filter((listener) => !beforeExitListeners.has(listener));
  const observed = {
    writeBarriers: writes.filter((chunk) => chunk === "").length,
    addedBeforeExitListeners: addedBeforeExitListeners.length,
  };

  for (const listener of addedBeforeExitListeners) {
    process.off("beforeExit", listener);
  }

  expect(observed).toEqual({
    writeBarriers: 1,
    addedBeforeExitListeners: 0,
  });
});

test.sequential("process.exit during a commit restores Fullscreen before the process terminates", async () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/process-exit-during-commit.mjs", import.meta.url),
  );
  const child = spawn(process.execPath, [fixture], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
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
  const enterIndex = stdout.indexOf(ansiEscapes.enterAlternativeScreen);
  const exitIndex = stdout.indexOf(ansiEscapes.exitAlternativeScreen);
  expect(enterIndex).toBeGreaterThanOrEqual(0);
  expect(exitIndex).toBeGreaterThan(enterIndex);
  expect(stdout).not.toContain("frame");
});

test.sequential("process.exit during teardown's final commit still restores Fullscreen", async () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/process-exit-during-final-commit.mjs", import.meta.url),
  );
  const child = spawn(process.execPath, [fixture], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
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
  expect(stdout).toContain(ansiEscapes.enterAlternativeScreen);
  expect(stdout).toContain(ansiEscapes.exitAlternativeScreen);
});
