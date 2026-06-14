import { spawn, type ChildProcess } from "node:child_process";
import type { Logger } from "./logger.ts";

export interface ProcessManagerOptions {
  bundlePath: string;
  hmrPort: number;
  logger: Logger;
  onExit?: (code: number | null) => void;
}

const loaderUrl = new URL("./hmr-loader.mjs", import.meta.url).href;

// Bootstrap script: register HMR loader hooks + silence Vite/Vue console noise
const loaderBootstrap = `data:text/javascript,${encodeURIComponent(`
import{register}from"node:module";
register(${JSON.stringify(loaderUrl)});

// Intercept all console methods to suppress Vite HMR client and Vue warn noise
for (const method of ["log", "info", "warn", "error", "debug"]) {
  const orig = console[method];
  console[method] = (...args) => {
    const first = typeof args[0] === "string" ? args[0] : "";
    if (first.includes("[vite]") || first.includes("[Vue warn]")) return;
    orig.apply(console, args);
  };
}
`)}`;

// @types/node@25 removed .on() from the ChildProcess class declaration
// even though it extends EventEmitter at runtime. This wrapper restores it.
type Process = ChildProcess & NodeJS.EventEmitter;

export function createProcessManager(options: ProcessManagerOptions) {
  let child: Process | null = null;
  let currentBundlePath = options.bundlePath;

  function doSpawn() {
    process.stdout.write("\x1b[2J\x1b[H");
    options.logger.mode = "silent";
    const proc = spawn("node", ["--import", loaderBootstrap, currentBundlePath], {
      stdio: "inherit",
      env: {
        ...process.env,
        VUE_TUI_DEV: "1",
        VUE_TUI_HMR_PORT: String(options.hmrPort),
      },
    }) as Process;
    child = proc;

    proc.on("exit", (code: number | null) => {
      options.logger.mode = "stdout";
      child = null;
      options.onExit?.(code);
    });
  }

  function waitForExit(proc: Process, timeout: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve();
      }, timeout);
      proc.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    spawn: doSpawn,

    setBundlePath(path: string) {
      currentBundlePath = path;
    },

    async restart() {
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(async () => {
        restartTimer = null;
        if (child) {
          child.kill("SIGTERM");
          await waitForExit(child, 2000);
          if (child) child.kill("SIGKILL");
        }
        doSpawn();
      }, 100);
    },

    async shutdown() {
      if (restartTimer) clearTimeout(restartTimer);
      if (child) {
        // Ask the child to stop gracefully FIRST, mirroring restart(). The dev
        // process gets SIGINT/SIGTERM directly, but the child is a plain spawn
        // with no shared signal — it never sees the parent's signal. Without
        // this SIGTERM, waitForExit blocks the full 2000ms and then SIGKILL
        // (uncatchable) skips the child's teardown: cursor stays hidden, the
        // alternate screen/kitty keyboard/raw mode are never restored.
        child.kill("SIGTERM");
        await waitForExit(child, 2000);
        if (child) child.kill("SIGKILL");
      }
    },

    get running() {
      return child !== null;
    },
  };
}
