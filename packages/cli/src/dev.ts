import { createServer } from "vite";
import { join } from "node:path";
import { createLogger } from "./logger.ts";
import { vueTuiDevPlugin } from "./vite-plugin.ts";
import { extractBundle, type MemoryFiles } from "./bundle-extractor.ts";
import { createProcessManager } from "./process-manager.ts";

async function waitForBundle(env: { memoryFiles: MemoryFiles }): Promise<void> {
  while (env.memoryFiles.files.size === 0) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

export interface ReloadRequestDeps {
  // Startup guard: reload requests fired before the app is ready are ignored.
  // A predicate (read at event time) rather than a value, so the live flag in
  // dev() is observed when each request arrives.
  shouldAccept: () => boolean;
  // True once shutdown() has begun. Re-checked AFTER the async extractBundle so a
  // reload accepted before Ctrl+C, but still extracting when teardown starts,
  // doesn't restart and orphan a child. Symmetric with respawnTick's guard.
  isShuttingDown: () => boolean;
  memoryFiles: MemoryFiles;
  outDir: string;
  pm: { setBundlePath(p: string): void; restart(): Promise<void> | void };
  logger: { error(msg: string): void };
  // Injected for testability (lets a test supply a rejecting extractor); the
  // dev() caller passes the real `extractBundle`.
  extractBundle?: (memoryFiles: MemoryFiles, outDir: string) => Promise<string>;
}

// Handle a `vue-tui:request-reload`: re-extract the freshly built bundle and
// restart the child process.
//
// WHY the try/catch: Vite's hot event emitter does NOT catch async handler
// rejections, so a rejected promise here escapes as an unhandledRejection that
// can take down the whole dev process. extractBundle throws ("No JS bundle
// found in Vite memoryFiles") on a transient/broken build — exactly the case
// the crash-respawn interval already guards against. On failure we log and KEEP
// the previous bundle (no setBundlePath/restart), so a momentarily broken build
// doesn't kill the dev server; it just waits for the next good build.
export async function handleReloadRequest(deps: ReloadRequestDeps): Promise<void> {
  if (!deps.shouldAccept()) return;
  const extract = deps.extractBundle ?? extractBundle;
  try {
    const newPath = await extract(deps.memoryFiles, deps.outDir);
    // Re-check AFTER the await: shutdown may have begun while we were
    // extracting. pm.shutdown() has already cleared its restart timer by then,
    // so a pm.restart() here would schedule a NEW one that fires post-teardown
    // and spawns an orphan child the parent never kills. Mirrors respawnTick.
    if (deps.isShuttingDown()) return;
    deps.pm.setBundlePath(newPath);
    await deps.pm.restart();
  } catch (err) {
    deps.logger.error(
      `Reload failed, keeping previous bundle: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export interface RespawnTickDeps {
  // True after a crash; false once a respawn succeeds.
  crashed: () => boolean;
  setCrashed: (value: boolean) => void;
  pm: { running: boolean; setBundlePath(p: string): void; spawn(): void };
  memoryFiles: MemoryFiles;
  outDir: string;
  // True once shutdown() has begun; the tick must not spawn during teardown.
  isShuttingDown: () => boolean;
  extractBundle?: (memoryFiles: MemoryFiles, outDir: string) => Promise<string>;
}

// One iteration of the crash-respawn interval: when the child has crashed and a
// fresh good build is available, re-extract it and respawn the child.
//
// WHY the two isShuttingDown() checks: the body is async (awaits extractBundle
// before pm.spawn()). The interval is cleared at the top of shutdown(), but a
// tick already mid-`await` when that happens would still reach pm.spawn() and
// orphan a brand-new child as the parent exits. The first check skips ticks that
// start during teardown; the second re-checks AFTER the await, since shutdown
// may have begun while we were extracting.
export async function respawnTick(deps: RespawnTickDeps): Promise<void> {
  if (deps.isShuttingDown()) return;
  if (!deps.crashed() || deps.pm.running) return;
  const extract = deps.extractBundle ?? extractBundle;
  try {
    const newPath = await extract(deps.memoryFiles, deps.outDir);
    if (deps.isShuttingDown()) return;
    deps.pm.setBundlePath(newPath);
    deps.setCrashed(false);
    deps.pm.spawn();
  } catch {
    // Build still broken, keep waiting.
  }
}

export interface ShutdownDeps {
  pm: { shutdown(): Promise<void> };
  closeServer: () => Promise<void>;
  // Clears the crash-respawn setInterval. Called FIRST so no new respawn tick
  // can be scheduled once teardown starts.
  clearRespawn: () => void;
  exit: (code: number) => void;
}

// Build the SIGINT/SIGTERM handler. Factored out (not inlined in dev()) so the
// re-entrancy guard and teardown ordering are unit-testable without a real
// process.exit / Vite server.
//
// WHY a `shuttingDown` flag:
//  - Re-entrancy: this is registered directly on SIGINT/SIGTERM. Pressing Ctrl+C
//    twice (common when shutdown feels slow) invokes the handler twice
//    concurrently. Without the guard that means double pm.shutdown()/closeServer
//    and two racing exit() calls. The flag makes the 2nd+ invocation a no-op.
//  - Orphan child: the crash-respawn interval is async (it awaits extractBundle
//    before pm.spawn()). clearRespawn() stops new ticks, but a tick already
//    in flight when shutdown starts could still reach pm.spawn() AFTER
//    pm.shutdown() finished — orphaning a brand-new child as the parent exits.
//    That in-flight tick checks the same `shuttingDown` flag (exposed via
//    isShuttingDown) and bails before spawning. See the respawn interval body.
export function createShutdown(deps: ShutdownDeps): {
  handler: () => Promise<void>;
  isShuttingDown: () => boolean;
} {
  let shuttingDown = false;
  const handler = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    // Stop the respawn interval BEFORE the async teardown window so no fresh
    // child is spawned while we're tearing the old one down.
    deps.clearRespawn();
    await deps.pm.shutdown();
    await deps.closeServer();
    deps.exit(0);
  };
  return { handler, isShuttingDown: () => shuttingDown };
}

export async function dev(entry?: string) {
  const logger = createLogger();
  logger.info("Starting vue-tui dev server...");

  const server = await createServer({
    plugins: [vueTuiDevPlugin({ entry })],
    logLevel: "silent",
  });

  await server.listen();
  const port = server.config.server.port!;
  logger.info(`Vite dev server on port ${port}`);

  const clientEnv = server.environments?.client as unknown as {
    memoryFiles: MemoryFiles;
  };

  if (!clientEnv?.memoryFiles) {
    logger.error("bundledDev environment not available. Ensure Vite 8+ with bundledDev support.");
    process.exit(1);
  }

  logger.info("Waiting for initial bundle...");
  await waitForBundle(clientEnv);

  const outDir = join(process.cwd(), "node_modules", ".vue-tui", "dev");
  let bundlePath = await extractBundle(clientEnv.memoryFiles, outDir);
  logger.info("Bundle ready.");

  let crashed = false;

  const pm = createProcessManager({
    bundlePath,
    hmrPort: port,
    logger,
    onExit(code) {
      if (code !== 0 && code !== null) {
        crashed = true;
        logger.info(`Process exited with code ${code}. Waiting for file changes...`);
      }
    },
  });

  pm.spawn();

  // Ignore reload requests during startup — the initial WS connection
  // may trigger vite:beforeFullReload before the app is ready
  let acceptReloads = false;
  setTimeout(() => {
    acceptReloads = true;
  }, 3000);

  // Declared before the interval so clearRespawn (below) can capture it; the
  // closure reads it at call time, after the assignment.
  let respawnInterval: ReturnType<typeof setInterval>;

  // Graceful shutdown. createShutdown owns the re-entrancy guard and clears the
  // respawn interval first; isShuttingDown is read by the respawn tick AND the
  // reload handler so neither can spawn/restart a child mid-teardown. See
  // createShutdown. Created before the hot handler is registered so a reload
  // event can never fire before `shutdown` exists.
  const shutdown = createShutdown({
    pm,
    closeServer: () => server.close(),
    clearRespawn: () => clearInterval(respawnInterval),
    exit: (code) => process.exit(code),
  });

  // Listen for full reload requests from child
  server.hot.on("vue-tui:request-reload", async () => {
    await handleReloadRequest({
      // Fast gate: ignore reloads before startup is ready OR once Ctrl+C
      // shutdown has begun (the post-await re-check below covers the case where
      // shutdown starts mid-extraction).
      shouldAccept: () => acceptReloads && !shutdown.isShuttingDown(),
      isShuttingDown: shutdown.isShuttingDown,
      memoryFiles: clientEnv.memoryFiles,
      outDir,
      pm,
      logger,
    });
  });

  // Re-spawn after crash on next successful bundle update
  respawnInterval = setInterval(() => {
    void respawnTick({
      crashed: () => crashed,
      setCrashed: (value) => {
        crashed = value;
      },
      pm,
      memoryFiles: clientEnv.memoryFiles,
      outDir,
      isShuttingDown: shutdown.isShuttingDown,
    });
  }, 500);

  process.on("SIGINT", shutdown.handler);
  process.on("SIGTERM", shutdown.handler);
}
