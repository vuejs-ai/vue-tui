import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

// Mock node:child_process so createProcessManager spawns a controllable fake
// child instead of a real `node` process. spawn() is called internally (not
// injectable), so a module mock is the only seam. vi.mock is hoisted above the
// imports below, so the factory must pull in its own deps (EventEmitter) via a
// require inside the closure — a top-level import isn't initialized yet here.
vi.mock("node:child_process", async () => {
  const { EventEmitter } = await import("node:events");
  class FakeChild extends EventEmitter {
    killed = false;
    // Records every signal in order so tests can assert SIGTERM precedes SIGKILL.
    kill = vi.fn((signal?: NodeJS.Signals) => {
      this.killed = true;
      // A well-behaved child exits in response to SIGTERM. Emit on the next tick
      // so the synchronous shutdown() body reaches `await waitForExit` first;
      // resolving fast keeps the test off the real 2000ms timeout path.
      if (signal === "SIGTERM") {
        queueMicrotask(() => this.emit("exit", 0));
      }
      return true;
    });
  }
  return {
    spawn: vi.fn(() => new FakeChild()),
  };
});

import { spawn } from "node:child_process";
import { createProcessManager } from "./process-manager.ts";

function makeManager() {
  return createProcessManager({
    bundlePath: "/tmp/fake-bundle.mjs",
    hmrPort: 1234,
    logger: { mode: "stdout", info() {}, error() {} },
  });
}

beforeEach(() => {
  vi.mocked(spawn).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("shutdown sends SIGTERM before force-killing the child", async () => {
  const pm = makeManager();
  pm.spawn();

  const child = vi.mocked(spawn).mock.results[0]?.value as {
    kill: ReturnType<typeof vi.fn>;
  };

  await pm.shutdown();

  // The bug: shutdown() waited 2s then SIGKILLed without ever asking the child
  // to stop gracefully. A child that catches SIGTERM (to restore the cursor,
  // leave the alternate screen, etc.) never got the chance.
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");

  const signals = child.kill.mock.calls.map((c) => c[0]);
  const termIndex = signals.indexOf("SIGTERM");
  const killIndex = signals.indexOf("SIGKILL");
  expect(termIndex).toBeGreaterThanOrEqual(0);
  // SIGTERM must come first if SIGKILL is sent at all.
  if (killIndex !== -1) {
    expect(termIndex).toBeLessThan(killIndex);
  }
});

test("shutdown does not SIGKILL a child that exits after SIGTERM", async () => {
  const pm = makeManager();
  pm.spawn();

  const child = vi.mocked(spawn).mock.results[0]?.value as {
    kill: ReturnType<typeof vi.fn>;
  };

  await pm.shutdown();

  // The fake child exits in response to SIGTERM, so waitForExit resolves and
  // the `if (child)` guard is false — no SIGKILL escalation needed.
  const signals = child.kill.mock.calls.map((c) => c[0]);
  expect(signals).toEqual(["SIGTERM"]);
});
