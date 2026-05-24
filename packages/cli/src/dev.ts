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

export async function dev(entry?: string) {
  const logger = createLogger();
  logger.info("Starting vue-tui dev server...");

  const server = await createServer({
    plugins: [vueTuiDevPlugin({ entry })],
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

  // Listen for full reload requests from child
  server.hot.on("vue-tui:request-reload", async () => {
    const newPath = await extractBundle(clientEnv.memoryFiles, outDir);
    pm.setBundlePath(newPath);
    pm.restart();
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
