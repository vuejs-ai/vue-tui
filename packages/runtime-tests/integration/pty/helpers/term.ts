import process from "node:process";
import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";

const require = createRequire(import.meta.url);

const { spawn } = require("node-pty") as typeof import("node-pty");

const fixturesDir = url.fileURLToPath(new URL("../fixtures", import.meta.url));

const term = (fixture: string, args: string[] = [], options: { readonly name?: string } = {}) => {
  let resolve: (value?: unknown) => void;
  let reject: (error?: Error) => void;

  const exitPromise = new Promise((resolve2, reject2) => {
    resolve = resolve2;
    reject = reject2;
  });

  // Resolves with the raw exit info (code + signal) no matter how the process
  // dies — used by signal-teardown tests where a SIGTERM/SIGINT kill is the
  // expected outcome and a non-zero/signalled exit must not reject.
  let exitInfoResolve: (info: { exitCode: number; signal?: number }) => void;
  const exitInfoPromise = new Promise<{ exitCode: number; signal?: number }>((r) => {
    exitInfoResolve = r;
  });

  let readyResolve: () => void;
  const readyPromise = new Promise<void>((r) => {
    readyResolve = r;
  });

  // Pending output-watchers: each resolves once the accumulated output matches
  // its predicate. node-pty can fire onExit BEFORE the final onData chunk is
  // delivered, so trailing bytes written during teardown (cursor restore,
  // leave-alt-screen) may arrive after the exit event — especially under CI
  // contention. Tests that assert on those bytes must wait for them, not for
  // exit. Checked on every onData chunk below.
  const outputWatchers = new Set<() => void>();

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NODE_NO_WARNINGS: "1",
    CI: "false",
    FORCE_COLOR: "3",
  };

  // First arg is often the desired rows count for viewport tests
  const rowsArg = args.length > 0 ? Number(args[0]) : NaN;
  const rows = Number.isFinite(rowsArg) && rowsArg > 0 ? rowsArg : 24;

  const ps = spawn("node", ["--import=tsx", path.join(fixturesDir, `${fixture}.tsx`), ...args], {
    name: options.name ?? "xterm-color",
    cols: 100,
    rows,
    cwd: fixturesDir,
    env,
  });

  let exited = false;

  const result = {
    get pid() {
      return ps.pid;
    },
    get exited() {
      return exited;
    },
    write(input: string | Buffer) {
      void readyPromise.then(() => {
        ps.write(input);
      });
    },
    // Send a process signal to the child once it has signalled readiness, so
    // signal-driven teardown is exercised against a fully mounted app.
    kill(signal: string) {
      void readyPromise.then(() => {
        ps.kill(signal);
      });
    },
    // Immediate best-effort signal for `finally` cleanup. Unlike kill(), this
    // does not wait for the fixture readiness marker, so a broken mount cannot
    // leave a child (including a stopped child) behind.
    killNow(signal: string) {
      if (exited) return;
      try {
        ps.kill(signal);
      } catch {
        // The process can exit concurrently with cleanup.
      }
    },
    async resize(columns: number, rows: number) {
      await readyPromise;
      ps.resize(columns, rows);
    },
    output: "",
    waitForExit: async () => exitPromise,
    waitForExitInfo: async () => exitInfoPromise,
    // Resolve once the accumulated output satisfies `predicate`, rejecting after
    // `timeoutMs`. Use this (not waitForExitInfo) when asserting on bytes the
    // child emits during teardown right before exit, which node-pty may deliver
    // after the exit event.
    waitForOutput: async (predicate: (output: string) => boolean, timeoutMs = 10000) =>
      new Promise<void>((res, rej) => {
        const check = () => {
          if (predicate(result.output)) {
            outputWatchers.delete(check);
            clearTimeout(timer);
            res();
            return true;
          }
          return false;
        };
        const timer = setTimeout(() => {
          outputWatchers.delete(check);
          rej(
            new Error(
              `waitForOutput timed out after ${timeoutMs}ms. Output:\n${JSON.stringify(result.output)}`,
            ),
          );
        }, timeoutMs);
        if (check()) return;
        outputWatchers.add(check);
      }),
  };

  ps.onData((data) => {
    result.output += data;

    if (result.output.includes("__READY__")) {
      readyResolve();
    }

    for (const watcher of outputWatchers) {
      watcher();
    }
  });

  ps.onExit(({ exitCode, signal }) => {
    exited = true;
    exitInfoResolve({ exitCode, signal });

    if (exitCode === 0) {
      resolve();
      return;
    }

    reject(new Error(`Process exited with non-zero exit code: ${exitCode}`));
  });

  return result;
};

export default term;
