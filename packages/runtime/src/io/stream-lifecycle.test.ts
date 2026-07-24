import { PassThrough } from "node:stream";
import { expect, test, vi } from "vite-plus/test";
import { runtimeResourceTracker } from "../resource-tracker.ts";
import { createMountedStreamLifecycle } from "./stream-lifecycle.ts";

test("shared borrowed streams use one physical observer set and release it with the last app", () => {
  const listenerResources = runtimeResourceTracker.snapshot().streamListeners;
  const stdin = new PassThrough();
  const stderr = new PassThrough();
  const stderrCallerError = vi.fn();
  stderr.on("error", stderrCallerError);
  const stderrBaseline = {
    error: stderr.listenerCount("error"),
    close: stderr.listenerCount("close"),
    finish: stderr.listenerCount("finish"),
    end: stderr.listenerCount("end"),
  };
  const stdinBaseline = {
    error: stdin.listenerCount("error"),
    close: stdin.listenerCount("close"),
    finish: stdin.listenerCount("finish"),
    end: stdin.listenerCount("end"),
  };
  const failures = Array.from({ length: 12 }, () => vi.fn());
  const stdoutStreams: PassThrough[] = [];
  const lifecycles = failures.map((onFailure) => {
    const stdout = new PassThrough();
    stdoutStreams.push(stdout);
    const lifecycle = createMountedStreamLifecycle({
      stdin,
      stdout,
      stderr,
      hasManagedInputDemand: () => false,
      onFailure,
    });
    lifecycle.activate();
    return lifecycle;
  });

  expect(stdin.listenerCount("error")).toBe(stdinBaseline.error + 1);
  expect(stdin.listenerCount("close")).toBe(stdinBaseline.close + 1);
  expect(stdin.listenerCount("finish")).toBe(stdinBaseline.finish + 1);
  expect(stdin.listenerCount("end")).toBe(stdinBaseline.end + 1);
  // Idle stderr is caller-owned and has no Runtime observer.
  expect(stderr.listenerCount("error")).toBe(stderrBaseline.error);

  for (const lifecycle of lifecycles) lifecycle.trackWrite(stderr);
  expect(stderr.listenerCount("error")).toBe(stderrBaseline.error + 1);
  expect(stderr.listenerCount("close")).toBe(stderrBaseline.close + 1);
  expect(stderr.listenerCount("finish")).toBe(stderrBaseline.finish + 1);
  expect(stderr.listenerCount("end")).toBe(stderrBaseline.end + 1);

  const failure = new Error("shared stderr failed");
  stderr.emit("error", failure);
  expect(stderrCallerError).toHaveBeenCalledWith(failure);
  for (const onFailure of failures) expect(onFailure).toHaveBeenCalledWith(failure);

  lifecycles[0]!.dispose();
  expect(stdin.listenerCount("error")).toBe(stdinBaseline.error + 1);
  for (const lifecycle of lifecycles.slice(1)) lifecycle.dispose();

  expect(stderr.listenerCount("error")).toBe(stderrBaseline.error);
  expect(stderr.listenerCount("close")).toBe(stderrBaseline.close);
  expect(stderr.listenerCount("finish")).toBe(stderrBaseline.finish);
  expect(stderr.listenerCount("end")).toBe(stderrBaseline.end);
  expect(stdin.listenerCount("error")).toBe(stdinBaseline.error);
  expect(stdin.listenerCount("close")).toBe(stdinBaseline.close);
  expect(stdin.listenerCount("finish")).toBe(stdinBaseline.finish);
  expect(stdin.listenerCount("end")).toBe(stdinBaseline.end);
  expect(runtimeResourceTracker.snapshot().streamListeners).toBe(listenerResources);

  for (const stdout of stdoutStreams) stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});

test("hostile listener cleanup still releases every observer resource and forgets the broker", () => {
  const listenerResources = runtimeResourceTracker.snapshot().streamListeners;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const baseline = {
    stdoutError: stdout.listenerCount("error"),
    stdoutClose: stdout.listenerCount("close"),
    stdoutFinish: stdout.listenerCount("finish"),
    stdoutEnd: stdout.listenerCount("end"),
    stdinError: stdin.listenerCount("error"),
    stdinClose: stdin.listenerCount("close"),
    stdinFinish: stdin.listenerCount("finish"),
    stdinEnd: stdin.listenerCount("end"),
  };
  const lifecycle = createMountedStreamLifecycle({
    stdin,
    stdout,
    stderr,
    hasManagedInputDemand: () => false,
    onFailure: vi.fn(),
  });
  lifecycle.activate();

  const cleanupFailure = new Error("stdout off failed");
  const originalOff = stdout.off.bind(stdout);
  let failedOnce = false;
  stdout.off = ((event: string | symbol, listener: (...args: unknown[]) => void) => {
    const result = originalOff(event, listener);
    if (!failedOnce) {
      failedOnce = true;
      throw cleanupFailure;
    }
    return result;
  }) as typeof stdout.off;

  expect(() => lifecycle.dispose()).toThrow(cleanupFailure);
  expect(stdout.listenerCount("error")).toBe(baseline.stdoutError);
  expect(stdout.listenerCount("close")).toBe(baseline.stdoutClose);
  expect(stdout.listenerCount("finish")).toBe(baseline.stdoutFinish);
  expect(stdout.listenerCount("end")).toBe(baseline.stdoutEnd);
  expect(stdin.listenerCount("error")).toBe(baseline.stdinError);
  expect(stdin.listenerCount("close")).toBe(baseline.stdinClose);
  expect(stdin.listenerCount("finish")).toBe(baseline.stdinFinish);
  expect(stdin.listenerCount("end")).toBe(baseline.stdinEnd);
  expect(runtimeResourceTracker.snapshot().streamListeners).toBe(listenerResources);

  stdout.off = originalOff as typeof stdout.off;
  const next = createMountedStreamLifecycle({
    stdin,
    stdout,
    stderr,
    hasManagedInputDemand: () => false,
    onFailure: vi.fn(),
  });
  next.activate();
  expect(stdout.listenerCount("error")).toBe(baseline.stdoutError + 1);
  next.dispose();
  expect(stdout.listenerCount("error")).toBe(baseline.stdoutError);
  expect(runtimeResourceTracker.snapshot().streamListeners).toBe(listenerResources);

  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});
