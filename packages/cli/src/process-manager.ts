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

export function createProcessManager(options: ProcessManagerOptions) {
  let child: ChildProcess | null = null;
  let currentBundlePath = options.bundlePath;

  function doSpawn() {
    process.stdout.write("\x1b[2J\x1b[H");
    options.logger.mode = "silent";
    child = spawn("node", ["--import", loaderBootstrap, currentBundlePath], {
      stdio: "inherit",
      env: {
        ...process.env,
        VUE_TUI_DEV: "1",
        VUE_TUI_HMR_PORT: String(options.hmrPort),
      },
    });

    child.on("exit", (code) => {
      options.logger.mode = "stdout";
      child = null;
      options.onExit?.(code);
    });
  }

  function waitForExit(proc: ChildProcess, timeout: number): Promise<void> {
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
        await waitForExit(child, 2000);
        if (child) child.kill("SIGKILL");
      }
    },

    get running() {
      return child !== null;
    },
  };
}
