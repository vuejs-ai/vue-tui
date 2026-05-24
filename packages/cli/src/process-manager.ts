import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Logger } from "./logger.ts";

export interface ProcessManagerOptions {
  bundlePath: string;
  hmrPort: number;
  logger: Logger;
  onExit?: (code: number | null) => void;
}

const loaderPath = fileURLToPath(new URL("./hmr-loader.mjs", import.meta.url));

export function createProcessManager(options: ProcessManagerOptions) {
  let child: ChildProcess | null = null;
  let currentBundlePath = options.bundlePath;

  function doSpawn() {
    options.logger.mode = "silent";
    child = spawn("node", ["--import", loaderPath, currentBundlePath], {
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
