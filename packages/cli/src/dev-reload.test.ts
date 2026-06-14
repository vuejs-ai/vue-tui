import { expect, test, vi } from "vite-plus/test";
import { handleReloadRequest } from "./dev.ts";
import type { MemoryFiles } from "./bundle-extractor.ts";

// A minimal MemoryFiles stub; the extractor is injected per-test, so its
// contents don't matter — the tests only care about how handleReloadRequest
// reacts to the extractor resolving vs rejecting.
const memoryFiles: MemoryFiles = {
  files: new Map(),
  get: () => undefined,
};

function makeDeps(
  extractBundle: (mf: MemoryFiles, outDir: string) => Promise<string>,
  shouldAccept = () => true,
  isShuttingDown = () => false,
) {
  const pm = {
    setBundlePath: vi.fn<(p: string) => void>(),
    restart: vi.fn<() => Promise<void>>(async () => {}),
  };
  const logger = { error: vi.fn<(msg: string) => void>() };
  const extract = vi.fn(extractBundle);
  return {
    deps: {
      shouldAccept,
      isShuttingDown,
      memoryFiles,
      outDir: "/tmp/out",
      pm,
      logger,
      extractBundle: extract,
    },
    pm,
    logger,
    extract,
  };
}

test("on success, sets the new bundle path and restarts", async () => {
  const { deps, pm, logger } = makeDeps(async () => "/tmp/out/entry.js");

  await handleReloadRequest(deps);

  expect(pm.setBundlePath).toHaveBeenCalledWith("/tmp/out/entry.js");
  expect(pm.restart).toHaveBeenCalledTimes(1);
  expect(logger.error).not.toHaveBeenCalled();
});

test("when extractBundle rejects, resolves without throwing and keeps the previous bundle", async () => {
  // WHY this matters: the dev() handler runs inside Vite's hot emitter, which
  // does NOT catch async handler rejections. An unguarded rejection escapes as
  // an unhandledRejection that can kill the whole dev process. A transient or
  // broken build makes extractBundle throw ("No JS bundle found"), so the
  // handler must absorb it: log, and keep the previous bundle (no
  // setBundlePath/restart) until the next good build.
  const { deps, pm, logger } = makeDeps(async () => {
    throw new Error("No JS bundle found in Vite memoryFiles");
  });

  // Must RESOLVE (not reject): a reject here would be the unhandledRejection bug.
  await expect(handleReloadRequest(deps)).resolves.toBeUndefined();

  expect(logger.error).toHaveBeenCalledTimes(1);
  expect(pm.setBundlePath).not.toHaveBeenCalled();
  expect(pm.restart).not.toHaveBeenCalled();
});

test("ignores the request when the startup guard rejects it", async () => {
  // During startup the initial WS connection can trigger a reload before the
  // app is ready; dev() gates these behind `acceptReloads`. The guard must
  // short-circuit BEFORE touching extractBundle/pm.
  const { deps, pm, extract } = makeDeps(
    async () => "/tmp/out/entry.js",
    () => false,
  );

  await handleReloadRequest(deps);

  expect(extract).not.toHaveBeenCalled();
  expect(pm.setBundlePath).not.toHaveBeenCalled();
  expect(pm.restart).not.toHaveBeenCalled();
});

test("fast gate: a shouldAccept that also consults isShuttingDown short-circuits before extract", async () => {
  // dev() composes shouldAccept as `() => acceptReloads && !isShuttingDown()`.
  // Once Ctrl+C shutdown begins, that predicate goes false (acceptReloads is
  // true but isShuttingDown() is true), so a reload arriving after teardown
  // started must short-circuit BEFORE touching extractBundle/pm — it must not
  // spawn a fresh child while the parent is exiting. We model the composed
  // predicate's result here with the live inputs.
  const acceptReloads = true;
  const isShuttingDown = () => true;
  const { deps, pm, extract } = makeDeps(
    async () => "/tmp/out/entry.js",
    () => acceptReloads && !isShuttingDown(),
  );

  await handleReloadRequest(deps);

  expect(extract).not.toHaveBeenCalled();
  expect(pm.setBundlePath).not.toHaveBeenCalled();
  expect(pm.restart).not.toHaveBeenCalled();
});

test("post-await guard: bails when shutdown begins DURING bundle extraction", async () => {
  // The load-bearing race (run-verified by the integration review): the reload
  // passes shouldAccept (acceptReloads is permanently true after 3s), then
  // Ctrl+C shutdown starts WHILE extractBundle is awaiting. pm.shutdown() has
  // already cleared its restartTimer, so a pm.restart() here would schedule a
  // NEW timer that fires after teardown — spawning an orphan child the parent
  // never kills. The post-await isShuttingDown() re-check must bail, mirroring
  // respawnTick's post-await guard.
  let shuttingDown = false;
  const { deps, pm } = makeDeps(
    async () => {
      // Shutdown is triggered mid-extraction (after shouldAccept passed).
      shuttingDown = true;
      return "/tmp/out/entry.js";
    },
    () => true, // shouldAccept: false at the top of the await, flips during it
    () => shuttingDown,
  );

  await handleReloadRequest(deps);

  expect(pm.setBundlePath).not.toHaveBeenCalled();
  expect(pm.restart).not.toHaveBeenCalled();
});
