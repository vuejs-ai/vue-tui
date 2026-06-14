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
    deps.pm.setBundlePath(newPath);
    await deps.pm.restart();
  } catch (err) {
    deps.logger.error(
      `Reload failed, keeping previous bundle: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
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

  // Listen for full reload requests from child
  server.hot.on("vue-tui:request-reload", async () => {
    await handleReloadRequest({
      shouldAccept: () => acceptReloads,
      memoryFiles: clientEnv.memoryFiles,
      outDir,
      pm,
      logger,
    });
  });

  // Re-spawn after crash on next successful bundle update
  setInterval(async () => {
    if (!crashed || pm.running) return;
    try {
      const newPath = await extractBundle(clientEnv.memoryFiles, outDir);
      pm.setBundlePath(newPath);
      crashed = false;
      pm.spawn();
    } catch {
      // Build still broken, keep waiting
    }
  }, 500);

  // Graceful shutdown
  const shutdown = async () => {
    await pm.shutdown();
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
