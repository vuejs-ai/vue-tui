import { expect, test, vi } from "vite-plus/test";
import { createShutdown, respawnTick } from "./dev.ts";
import type { MemoryFiles } from "./bundle-extractor.ts";

// A controllable deferred promise so two concurrent shutdown invocations can be
// observed overlapping BEFORE the first one resolves — this is what proves the
// re-entrancy guard handles true concurrency, not just sequential repeat calls.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function makeDeps() {
  const gate = deferred<void>();
  const pm = { shutdown: vi.fn<() => Promise<void>>(() => gate.promise) };
  const closeServer = vi.fn<() => Promise<void>>(async () => {});
  const clearRespawn = vi.fn<() => void>();
  const exit = vi.fn<(code: number) => void>();
  return {
    deps: { pm, closeServer, clearRespawn, exit },
    pm,
    closeServer,
    clearRespawn,
    exit,
    gate,
  };
}

test("shutdown clears the respawn interval BEFORE the async teardown window", async () => {
  // WHY: the crash-respawn setInterval is otherwise never cleared. It must be
  // cleared synchronously, BEFORE awaiting pm.shutdown(), or an in-flight respawn
  // tick during that async window can call pm.spawn() and orphan a brand-new
  // child. pm.shutdown is gated on a deferred promise, so the handler is
  // suspended at `await pm.shutdown()` until we resolve it — letting us assert
  // ordering while teardown is mid-flight.
  const { deps, pm, closeServer, clearRespawn, exit, gate } = makeDeps();
  const { handler } = createShutdown(deps);

  const p = handler();
  // Let the synchronous prologue + the microtask up to `await pm.shutdown()` run.
  await Promise.resolve();

  // clearRespawn must already have run, and we must be suspended inside
  // pm.shutdown() — but NOT yet have closed the server or exited. This pins the
  // order: clearRespawn → pm.shutdown → (gate) → closeServer → exit.
  expect(clearRespawn).toHaveBeenCalledTimes(1);
  expect(pm.shutdown).toHaveBeenCalledTimes(1);
  expect(closeServer).not.toHaveBeenCalled();
  expect(exit).not.toHaveBeenCalled();

  gate.resolve();
  await p;

  expect(closeServer).toHaveBeenCalledTimes(1);
  expect(exit).toHaveBeenCalledWith(0);
});

test("concurrent shutdown invocations run teardown exactly once (Ctrl+C twice)", async () => {
  // WHY: shutdown was registered directly as the SIGINT/SIGTERM handler with no
  // re-entrancy guard. Pressing Ctrl+C twice (common when shutdown feels slow)
  // invokes shutdown() twice concurrently → double pm.shutdown()/server.close()
  // and two racing process.exit(0). The deferred gate keeps both invocations
  // overlapping before the first resolves, so this is concurrent re-entrancy.
  const { deps, pm, closeServer, clearRespawn, exit, gate } = makeDeps();
  const { handler } = createShutdown(deps);

  const both = Promise.all([handler(), handler()]);
  // Both handlers are now past their synchronous prologue and awaiting the gate.
  gate.resolve();
  await both;

  expect(pm.shutdown).toHaveBeenCalledTimes(1);
  expect(closeServer).toHaveBeenCalledTimes(1);
  expect(exit).toHaveBeenCalledTimes(1);
  expect(clearRespawn).toHaveBeenCalledTimes(1);
});

const memoryFiles: MemoryFiles = {
  files: new Map(),
  get: () => undefined,
};

test("respawn tick does not spawn a child when shutdown has begun", async () => {
  // WHY: clearInterval stops new ticks, but a tick already past its synchronous
  // guard and awaiting extractBundle could still reach pm.spawn() AFTER
  // pm.shutdown() finished, orphaning a brand-new child as the parent exits. The
  // tick re-checks isShuttingDown after the await and must bail.
  const pm = {
    running: false,
    setBundlePath: vi.fn<(p: string) => void>(),
    spawn: vi.fn<() => void>(),
  };
  await respawnTick({
    crashed: () => true,
    setCrashed: vi.fn(),
    pm,
    memoryFiles,
    outDir: "/tmp/out",
    isShuttingDown: () => true,
    extractBundle: async () => "/tmp/out/entry.js",
  });

  expect(pm.spawn).not.toHaveBeenCalled();
  expect(pm.setBundlePath).not.toHaveBeenCalled();
});

test("respawn tick does not spawn when shutdown begins DURING bundle extraction", async () => {
  // The realistic race: the tick passes its first isShuttingDown() check, then
  // shutdown starts while extractBundle is awaiting. The post-await re-check is
  // what prevents the orphan here.
  let shuttingDown = false;
  const pm = {
    running: false,
    setBundlePath: vi.fn<(p: string) => void>(),
    spawn: vi.fn<() => void>(),
  };
  await respawnTick({
    crashed: () => true,
    setCrashed: vi.fn(),
    pm,
    memoryFiles,
    outDir: "/tmp/out",
    isShuttingDown: () => shuttingDown,
    extractBundle: async () => {
      // Shutdown is triggered mid-extraction.
      shuttingDown = true;
      return "/tmp/out/entry.js";
    },
  });

  expect(pm.spawn).not.toHaveBeenCalled();
  expect(pm.setBundlePath).not.toHaveBeenCalled();
});

test("respawn tick spawns a fresh child on a good build after a crash", async () => {
  // Positive path: not shutting down, crashed, build available → respawn.
  const setCrashed = vi.fn<(value: boolean) => void>();
  const pm = {
    running: false,
    setBundlePath: vi.fn<(p: string) => void>(),
    spawn: vi.fn<() => void>(),
  };
  await respawnTick({
    crashed: () => true,
    setCrashed,
    pm,
    memoryFiles,
    outDir: "/tmp/out",
    isShuttingDown: () => false,
    extractBundle: async () => "/tmp/out/entry.js",
  });

  expect(pm.setBundlePath).toHaveBeenCalledWith("/tmp/out/entry.js");
  expect(setCrashed).toHaveBeenCalledWith(false);
  expect(pm.spawn).toHaveBeenCalledTimes(1);
});
