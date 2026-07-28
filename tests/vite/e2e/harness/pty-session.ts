import { createRequire } from "node:module";
import process from "node:process";
import type { IDisposable, IPty } from "node-pty";

const require = createRequire(import.meta.url);
const { spawn } = require("node-pty") as typeof import("node-pty");

const DEFAULT_OUTPUT_TIMEOUT_MS = 20_000;
/**
 * Ctrl-C is a courtesy: disposal runs after a test's assertions, and a fixture
 * that takes raw mode and swallows the keypress can never exit this way, so a
 * long first wait is dead time on every run. 26 of 27 children exit within ~16ms.
 */
const CTRL_C_GRACE_MS = 500;
const SIGNAL_GRACE_MS = 2_000;

export interface PtyExit {
  readonly exitCode: number;
  readonly signal?: number;
}

export interface PtySessionOptions {
  /** argv[0] plus arguments. */
  readonly command: readonly string[];
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly columns: number;
  readonly rows: number;
  /** Every byte the child writes, in order, before it is appended to `output`. */
  readonly onData: (data: string) => void;
}

export interface ExpectOutputOptions {
  readonly after?: number;
  readonly timeoutMs?: number;
  /**
   * Give up when some collaborator this session does not know about has already
   * failed. Without it a dead event channel surfaces here as a bare timeout
   * instead of its cause.
   */
  readonly abortWhen?: () => Error | undefined;
}

/**
 * A PTY subprocess this harness owns, and its byte stream.
 *
 * Deliberately ignorant of Vite, the event channel, and the screen model: it
 * knows a command, its output, and how to end it. Anything that needs two of
 * those collaborators (ordering a resize against the screen, closing the channel
 * during teardown) belongs to whoever composed them.
 */
export interface PtySession {
  readonly pid: number;
  /** Live: `undefined` until the child exits. */
  readonly exit: PtyExit | undefined;
  /** Live: every byte received so far. */
  readonly output: string;
  readonly exited: Promise<PtyExit>;
  /** Throws a plain Error; callers that need diagnostics add them. */
  assertRunning(): void;
  write(data: string | Buffer): void;
  /**
   * Write only if the child can still receive it. For output the child solicited
   * — a terminal query reply — where arriving late is normal and must not fail
   * the test that happened to be running.
   */
  tryWrite(data: string | Buffer): void;
  resize(columns: number, rows: number): void;
  kill(signal?: string): void;
  expectOutput(token: string, options?: ExpectOutputOptions): Promise<void>;
  /**
   * End the process and release its listeners. Returns the failures instead of
   * throwing so a caller can fold them into a wider teardown.
   */
  end(): Promise<Error[]>;
}

export function startPtySession(options: PtySessionOptions): PtySession {
  const [file, ...args] = options.command;
  const pty: IPty = spawn(file, args, {
    name: "xterm-256color",
    cols: options.columns,
    rows: options.rows,
    cwd: options.cwd,
    env: options.env,
  });

  let output = "";
  let exit: PtyExit | undefined;
  let ending = false;
  let endPromise: Promise<Error[]> | undefined;
  let resolveExited!: (value: PtyExit) => void;
  const exited = new Promise<PtyExit>((resolve) => {
    resolveExited = resolve;
  });

  const dataDisposable: IDisposable = pty.onData((data) => {
    output += data;
    options.onData(data);
  });
  const exitDisposable: IDisposable = pty.onExit(({ exitCode, signal }) => {
    if (exit !== undefined) return;
    exit = signal === undefined ? { exitCode } : { exitCode, signal };
    resolveExited(exit);
  });

  // node-pty maps a signal to `process.kill(pid, signal)` and swallows the throw
  // (unixTerminal.js:228); on Windows it takes no signal at all.
  const signalled = (signal?: string): string | undefined =>
    process.platform === "win32" ? undefined : signal;

  const waitForExit = async (timeoutMs: number): Promise<boolean> => {
    if (exit !== undefined) return true;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      exited,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    if (timer !== undefined) clearTimeout(timer);
    return exit !== undefined;
  };

  const assertRunning = (): void => {
    if (exit !== undefined) {
      throw new Error(`Vite child has already exited: ${JSON.stringify(exit)}`);
    }
    if (ending) {
      throw new Error("Vite child is being disposed");
    }
  };

  const expectOutput = async (
    token: string,
    expectOptions: ExpectOutputOptions = {},
  ): Promise<void> => {
    const after = expectOptions.after ?? 0;
    const timeoutMs = expectOptions.timeoutMs ?? DEFAULT_OUTPUT_TIMEOUT_MS;
    if (output.indexOf(token, after) !== -1) return;
    assertRunning();

    await new Promise<void>((resolve, reject) => {
      let finished = false;
      let timer: NodeJS.Timeout | undefined;
      let dataWaiter: IDisposable | undefined;
      let exitWaiter: IDisposable | undefined;
      const finish = (error?: Error): void => {
        if (finished) return;
        finished = true;
        if (timer !== undefined) clearTimeout(timer);
        dataWaiter?.dispose();
        exitWaiter?.dispose();
        if (error === undefined) resolve();
        else reject(error);
      };
      const check = (): void => {
        if (output.indexOf(token, after) !== -1) {
          finish();
          return;
        }
        const aborted = expectOptions.abortWhen?.();
        if (aborted !== undefined) {
          finish(aborted);
          return;
        }
        if (exit !== undefined) {
          finish(
            new Error(
              `Vite child exited before PTY output ${JSON.stringify(token)} appeared after offset ${after}`,
            ),
          );
        }
      };

      // node-pty's event getter only pushes onto its listener array, so none of
      // these can fire synchronously and `finished` is still false below.
      dataWaiter = pty.onData(check);
      exitWaiter = pty.onExit(check);
      timer = setTimeout(() => {
        finish(
          new Error(
            `Timed out after ${timeoutMs}ms waiting for PTY output ${JSON.stringify(token)} after offset ${after}`,
          ),
        );
      }, timeoutMs);
      check();
    });
  };

  const end = (): Promise<Error[]> => {
    endPromise ??= (async () => {
      ending = true;
      const errors: Error[] = [];
      // Cleanup races natural exit, so a failed signal is not itself an error —
      // whether the process actually went away is checked after every rung.
      const attempt = (operation: () => void): void => {
        try {
          operation();
        } catch {
          // Checked by the waitForExit that follows.
        }
      };

      if (exit === undefined) {
        // A suspended child cannot act on anything until it is resumed.
        if (process.platform !== "win32") attempt(() => pty.kill("SIGCONT"));
        attempt(() => pty.write("\x03"));
        if (!(await waitForExit(CTRL_C_GRACE_MS))) {
          attempt(() => pty.kill(signalled("SIGTERM")));
        }
        // No rung past SIGKILL: re-sending it directly would be the same syscall
        // on the same pid, and on Windows it would send nothing at all.
        if (!(await waitForExit(SIGNAL_GRACE_MS))) {
          attempt(() => pty.kill(signalled("SIGKILL")));
        }
        if (!(await waitForExit(SIGNAL_GRACE_MS))) {
          errors.push(new Error(`Vite child ${pty.pid} did not exit during disposal`));
        }
      }

      for (const disposable of [dataDisposable, exitDisposable]) {
        try {
          disposable.dispose();
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
      return errors;
    })();
    return endPromise;
  };

  return {
    pid: pty.pid,
    get exit() {
      return exit;
    },
    get output() {
      return output;
    },
    exited,
    assertRunning,
    write(data) {
      assertRunning();
      pty.write(data);
    },
    tryWrite(data) {
      if (exit !== undefined || ending) return;
      pty.write(data);
    },
    resize(columns, rows) {
      pty.resize(columns, rows);
    },
    kill(signal) {
      if (exit !== undefined) return;
      try {
        pty.kill(signalled(signal));
      } catch (error) {
        if (exit === undefined) throw error;
      }
    },
    expectOutput,
    end,
  };
}
