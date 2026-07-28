import { createRequire } from "node:module";
import process from "node:process";
import { afterEach } from "vite-plus/test";
import type { IDisposable, IPty } from "node-pty";

const require = createRequire(import.meta.url);
const { spawn } = require("node-pty") as typeof import("node-pty");

const OUTPUT_QUIET_MS = 25;
const OUTPUT_DRAIN_TIMEOUT_MS = 1_000;
const TERMINATE_GRACE_MS = 500;
const KILL_GRACE_MS = 1_500;

export interface PtyExit {
  readonly exitCode: number;
  readonly signal?: number;
}

export interface PtySessionOptions {
  readonly command: readonly [string, ...string[]];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly columns?: number;
  readonly rows?: number;
  readonly terminalName?: string;
  /** Delay fixture input until this marker has appeared. */
  readonly readyToken?: string;
}

export interface PtySession {
  readonly pid: number;
  readonly exited: boolean;
  readonly exit: PtyExit | undefined;
  readonly output: string;
  write(input: string | Buffer): void;
  kill(signal: string): void;
  killNow(signal: string): void;
  resize(columns: number, rows: number): Promise<void>;
  waitForExit(): Promise<void>;
  waitForExitInfo(): Promise<PtyExit>;
  waitForOutput(predicate: (output: string) => boolean, timeoutMs?: number): Promise<void>;
  dispose(): Promise<void>;
}

function childEnvironment(
  terminalName: string,
  overrides: Readonly<Record<string, string>>,
): Record<string, string> {
  const environment = { ...(process.env as Record<string, string>) };
  delete environment.NO_COLOR;
  delete environment.NODE_DISABLE_COLORS;
  delete environment.FORCE_COLOR;
  delete environment.NODE_NO_WARNINGS;
  Object.assign(environment, { TERM: terminalName, COLORTERM: "truecolor" }, overrides);
  if (
    environment.FORCE_COLOR !== undefined &&
    ((environment.NO_COLOR !== undefined && environment.NO_COLOR !== "") ||
      (environment.NODE_DISABLE_COLORS !== undefined && environment.NODE_DISABLE_COLORS !== ""))
  ) {
    throw new Error("PTY child environment cannot combine FORCE_COLOR with a color-disable flag.");
  }
  return environment;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function nextEventLoopTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const activeSessions = new Set<PtySession>();

export function startPtySession(options: PtySessionOptions): PtySession {
  const [file, ...args] = options.command;
  const terminalName = options.terminalName ?? "xterm-256color";
  const pty: IPty = spawn(file, args, {
    name: terminalName,
    cols: options.columns ?? 100,
    rows: options.rows ?? 24,
    cwd: options.cwd,
    env: childEnvironment(terminalName, options.env ?? {}),
  });

  let output = "";
  let revision = 0;
  let exit: PtyExit | undefined;
  let finalized = false;
  let disposePromise: Promise<void> | undefined;
  let resolveExit!: (value: PtyExit) => void;
  const rawExit = new Promise<PtyExit>((resolve) => {
    resolveExit = resolve;
  });
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  if (options.readyToken === undefined) resolveReady();

  const outputWatchers = new Set<() => void>();
  const dataDisposable: IDisposable = pty.onData((data) => {
    output += data;
    revision += 1;
    if (options.readyToken !== undefined && output.includes(options.readyToken)) resolveReady();
    for (const watcher of outputWatchers) watcher();
  });
  const exitDisposable: IDisposable = pty.onExit(({ exitCode, signal }) => {
    if (exit !== undefined) return;
    exit = signal === undefined ? { exitCode } : { exitCode, signal };
    // Do not strand a queued write forever when a fixture dies before readiness.
    resolveReady();
    resolveExit(exit);
  });

  const waitForRawExit = async (timeoutMs: number): Promise<boolean> => {
    if (exit !== undefined) return true;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      rawExit,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    if (timer !== undefined) clearTimeout(timer);
    return exit !== undefined;
  };

  // node-pty can deliver the final onData after onExit. There is no separate
  // public close event for that byte stream, so wait for an event-loop turn and
  // a bounded quiet period after exit before treating output as complete.
  const drainOutput = async (): Promise<void> => {
    await rawExit;
    const deadline = Date.now() + OUTPUT_DRAIN_TIMEOUT_MS;
    while (true) {
      const before = revision;
      await nextEventLoopTurn();
      await delay(OUTPUT_QUIET_MS);
      await nextEventLoopTurn();
      if (revision === before) return;
      if (Date.now() >= deadline) {
        throw new Error(
          `PTY output did not become quiet within ${OUTPUT_DRAIN_TIMEOUT_MS}ms after exit`,
        );
      }
    }
  };

  const finalize = (): void => {
    if (finalized) return;
    finalized = true;
    dataDisposable.dispose();
    exitDisposable.dispose();
    activeSessions.delete(session);
  };

  const waitForExitInfo = async (): Promise<PtyExit> => {
    const info = await rawExit;
    try {
      await drainOutput();
      return info;
    } finally {
      finalize();
    }
  };

  const killNow = (signal: string): void => {
    if (exit !== undefined) return;
    try {
      pty.kill(process.platform === "win32" ? undefined : signal);
    } catch {
      // Exit can race teardown.
    }
  };

  const session: PtySession = {
    get pid() {
      return pty.pid;
    },
    get exited() {
      return exit !== undefined;
    },
    get exit() {
      return exit;
    },
    get output() {
      return output;
    },
    write(input) {
      void ready.then(() => {
        if (exit === undefined) pty.write(input);
      });
    },
    kill(signal) {
      void ready.then(() => killNow(signal));
    },
    killNow,
    async resize(columns, rows) {
      await ready;
      if (exit === undefined) pty.resize(columns, rows);
    },
    async waitForExit() {
      const info = await waitForExitInfo();
      if (info.exitCode !== 0) {
        throw new Error(`Process exited with non-zero code: ${info.exitCode}\n${output}`);
      }
    },
    waitForExitInfo,
    async waitForOutput(predicate, timeoutMs = 10_000) {
      if (predicate(output)) return;
      await new Promise<void>((resolve, reject) => {
        let finished = false;
        const finish = (error?: Error): void => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          outputWatchers.delete(check);
          if (error === undefined) resolve();
          else reject(error);
        };
        const check = (): void => {
          if (predicate(output)) finish();
        };
        const timer = setTimeout(() => {
          finish(
            new Error(
              `waitForOutput timed out after ${timeoutMs}ms. Output:\n${JSON.stringify(output)}`,
            ),
          );
        }, timeoutMs);
        outputWatchers.add(check);
        void rawExit.then(async () => {
          try {
            await drainOutput();
            if (predicate(output)) finish();
            else
              finish(
                new Error(`Process exited before the expected PTY output. Output:\n${output}`),
              );
          } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)));
          }
        });
        check();
      });
    },
    dispose() {
      disposePromise ??= (async () => {
        const errors: unknown[] = [];
        try {
          if (exit === undefined) {
            if (process.platform !== "win32") killNow("SIGCONT");
            killNow("SIGTERM");
            if (!(await waitForRawExit(TERMINATE_GRACE_MS))) {
              if (process.platform !== "win32") killNow("SIGCONT");
              killNow("SIGKILL");
              if (!(await waitForRawExit(KILL_GRACE_MS))) {
                errors.push(new Error(`PTY process ${pty.pid} did not exit after SIGKILL`));
              }
            }
          }
          if (exit !== undefined) await drainOutput();
        } catch (error) {
          errors.push(error);
        } finally {
          finalize();
        }
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) throw new AggregateError(errors, "Failed to dispose PTY session");
      })();
      return disposePromise;
    },
  };

  activeSessions.add(session);
  return session;
}

afterEach(async () => {
  const results = await Promise.allSettled([...activeSessions].map((session) => session.dispose()));
  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Failed to clean up PTY sessions");
});
