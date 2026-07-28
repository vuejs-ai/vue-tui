import { statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { describeChildFailure, formatEventLog } from "./diagnostics.ts";
import { RUNTIME_TEST_EVENT } from "@vue-tui/runtime/internal/testing";
import { asError } from "./errors.ts";
import {
  createEventChannel,
  EventChannelPrematureCloseError,
  type ExpectEventOptions,
  type QuiesceOptions,
  type TestEvent,
} from "./events.ts";
import { EVENT_ADDRESS_ENV } from "./protocol.ts";
import { startPtySession, type PtyExit, type PtySession } from "./pty-session.ts";
import { createHarnessScreen, stripAnsi } from "./screen.ts";
import { waitForScreen, type ExpectScreenOptions as ScreenWaitOptions } from "./screen-wait.ts";
import { resolveViteBin } from "./vite-cli.ts";

const launcherUrl = new URL("./launcher.ts", import.meta.url).href;

/**
 * How long disposal gives the launcher to acknowledge the event-stream finish
 * request. A timeout is a failure, not a clean snapshot, so increasing this is
 * only scheduling headroom and cannot move a false-green boundary.
 */
const PROTOCOL_FINISH_MS = 5_000;

/**
 * The app's most recent committed frame, as the runtime reported it.
 *
 * Taken from the event rather than re-derived from the PTY stream. Reading the
 * last synchronized-output block looked equivalent and is not: the runtime's
 * output coordinator wraps side output in those markers too — Vite's own
 * diagnostics measurably land inside one — and a Fullscreen commit writes a line
 * diff, so the last block can be a single changed row rather than the frame.
 */
function latestCommittedFrame(events: readonly TestEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (event.ev !== RUNTIME_TEST_EVENT.paintCommitted) continue;
    const frame = (event.data as { frame?: unknown } | undefined)?.frame;
    if (typeof frame !== "string") return undefined;
    // The event carries the frame with its styling, because that is what the
    // runtime wrote; assertions read text, so normalize here rather than making
    // every caller do it.
    return stripAnsi(frame).replace(/\r\n?/g, "\n");
  }
  return undefined;
}

/**
 * Whether the terminal is really showing the frame the runtime reported.
 *
 * The event says what the runtime handed to its writer. This is the part that
 * says it survived the cursor diff, the synchronized-output markers and xterm's
 * parser — without it a frame assertion proves an intention, not a terminal.
 *
 * Vite's coordinated log lines can sit above the app, so the frame need not start
 * at viewport row zero. The current app frame must nevertheless be the viewport's
 * visible suffix. Searching anywhere would let an old Inline frame in scrollback
 * certify a later corrupted paint. Only the last `rows` lines of a frame can
 * still be visible at all, so a taller frame is checked on that suffix.
 *
 * Exported for its own tests: every end-to-end frame assertion depends on what
 * this accepts, and a version that accepted everything would leave them all
 * green while proving nothing.
 */
export function screenShowsFrame(frame: string, screen: string, rows: number): boolean {
  const painted = frame.split("\n").map((line) => line.trimEnd());
  const visiblePainted = painted.slice(-rows);
  const onScreen = screen.split("\n").map((line) => line.trimEnd());
  // xterm's viewport reader omits empty rows below the last visible character.
  // Remove only that unobservable suffix; leading and interior blanks are layout.
  while (visiblePainted.at(-1) === "") visiblePainted.pop();
  while (onScreen.at(-1) === "") onScreen.pop();
  // An empty reported frame is still an appearance claim. It cannot certify a
  // viewport that retains visible bytes from an older frame or a failed clear.
  if (visiblePainted.length === 0) return onScreen.length === 0;

  if (visiblePainted.length > onScreen.length) return false;
  const start = onScreen.length - visiblePainted.length;
  return visiblePainted.every((line, offset) => onScreen[start + offset] === line);
}

/**
 * Host variables the child inherits verbatim. Exported because the launcher's own
 * probe must run in the same environment the real child gets — a key added here
 * and not there would silently make that test prove nothing.
 */
export const INHERITED_ENVIRONMENT = [
  "PATH",
  "Path",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SYSTEMROOT",
  "SystemRoot",
] as const;
const RESERVED_ENVIRONMENT = new Set([
  "CI",
  "COLORTERM",
  "FORCE_COLOR",
  "NODE_DISABLE_COLORS",
  "NODE_NO_WARNINGS",
  "NO_COLOR",
  "PATH",
  "SYSTEMROOT",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  EVENT_ADDRESS_ENV,
]);

export type ViteChildExit = PtyExit;

export interface LaunchViteChildOptions {
  readonly columns?: number;
  readonly rows?: number;
  /** Set false only for a scenario that deliberately exercises interactive Vite behavior. */
  readonly ci?: boolean;
  readonly env?: Readonly<Record<string, string>>;
  /** Use a consumer project's installed Vite instead of the test workspace's copy. */
  readonly viteBin?: string;
}

export type ExpectScreenOptions = ScreenWaitOptions;

export interface ExpectOutputOptions {
  readonly after?: number;
  readonly timeoutMs?: number;
}

export interface ViteChild {
  readonly pid: number;
  readonly events: readonly TestEvent[];
  readonly exited: Promise<ViteChildExit>;
  output(): string;
  expectOutput(token: string, options?: ExpectOutputOptions): Promise<void>;
  screen(): Promise<string>;
  /** The Runtime's most recently committed complete app frame. */
  frame(): string | undefined;
  expectFrame(
    predicate: (frame: string) => boolean,
    options?: ExpectScreenOptions,
  ): Promise<string>;
  expectEvent(event: string, options?: ExpectEventOptions): Promise<TestEvent>;
  expectScreen(
    predicate: (screen: string) => boolean,
    options?: ExpectScreenOptions,
  ): Promise<string>;
  quiesce(ms: number, options?: QuiesceOptions): Promise<void>;
  write(data: string | Buffer): void;
  resize(columns: number, rows: number): Promise<void>;
  kill(signal?: string): void;
  /**
   * Declare that this child is expected to disconnect before completing the
   * event protocol, so disposal does not fail the test for that disconnect.
   * Malformed events and sequence violations are still failures.
   *
   * Call it at the point the test does the killing — a signal, a deliberate
   * crash, a launch that was never meant to succeed. Everything else must finish
   * with the launcher's `harness:event-stream-end` acknowledgement, because an
   * `app:exit` can be followed by a new generation during config restart, and a
   * child that vanished mid-test is otherwise indistinguishable from one that
   * finished: every assertion up to that point already passed.
   */
  allowUncleanExit(reason: string): void;
  dispose(): Promise<void>;
}

function controlledEnvironment(
  address: string,
  options: LaunchViteChildOptions,
): Record<string, string> {
  const env: Record<string, string> = {
    FORCE_COLOR: "3",
    COLORTERM: "truecolor",
    TERM: "xterm-256color",
    [EVENT_ADDRESS_ENV]: address,
  };
  for (const key of INHERITED_ENVIRONMENT) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (RESERVED_ENVIRONMENT.has(key.toUpperCase())) {
      throw new Error(`child env cannot override reserved variable ${key}`);
    }
    env[key] = value;
  }
  if (options.ci !== false) {
    env.CI = "true";
  }
  return env;
}

export async function launchViteChild(
  root: string,
  options: LaunchViteChildOptions = {},
): Promise<ViteChild> {
  // A value check, not a type check: path.resolve("") returns the cwd, which is a
  // directory, so an empty root would silently launch Vite in the wrong place.
  if (root.length === 0) {
    throw new TypeError("Vite child root must be a non-empty string");
  }
  const resolvedRoot = path.resolve(root);
  if (!statSync(resolvedRoot).isDirectory()) {
    throw new Error(`Vite child root is not a directory: ${resolvedRoot}`);
  }

  const columns = options.columns ?? 80;
  const rows = options.rows ?? 24;
  const viteBin = options.viteBin ?? resolveViteBin();
  if (!path.isAbsolute(viteBin)) {
    throw new Error(`Vite CLI path must be absolute: ${JSON.stringify(viteBin)}`);
  }
  if (!statSync(viteBin).isFile()) {
    throw new Error(`Vite CLI path is not a file: ${viteBin}`);
  }
  // How much of a frame can still be in the viewport. Tracked rather than closed
  // over, because `resize` changes it and the frame check reads it afterwards.
  let visibleRows = rows;

  // The screen must exist before the session, because the session streams into
  // it; the screen answers terminal queries back to a session that does not
  // exist yet. Hence the late binding rather than a constructor argument.
  let session: PtySession | undefined;
  const replyToChild = (data: string | Buffer): void => session?.tryWrite(data);
  const screenModel = createHarnessScreen(columns, rows, {
    onData: replyToChild,
    onBinary: (data) => replyToChild(Buffer.from(data, "binary")),
  });

  // Each step below owns undoing the ones before it: nothing else has a handle
  // on them yet, so a throw here would otherwise leak a socket or a WASM screen.
  let channel: Awaited<ReturnType<typeof createEventChannel>>;
  try {
    channel = await createEventChannel();
  } catch (error) {
    await screenModel.dispose();
    throw error;
  }

  let env: Record<string, string>;
  try {
    env = controlledEnvironment(channel.address, options);
  } catch (error) {
    await channel.close();
    await screenModel.dispose();
    throw error;
  }

  const command = [process.execPath, `--import=${launcherUrl}`, viteBin, resolvedRoot] as const;
  try {
    session = startPtySession({
      command,
      cwd: resolvedRoot,
      env,
      columns,
      rows,
      onData: (data) => screenModel.write(data),
    });
  } catch (error) {
    const settled = await Promise.allSettled([channel.close(), screenModel.dispose()]);
    const cleanupErrors = settled
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason);
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        "Vite child spawn and harness cleanup both failed",
      );
    }
    throw error;
  }

  const live = session;
  const diagnostic = (error: Error): Error => {
    let screen: string;
    try {
      screen = screenModel.currentText();
    } catch (screenError) {
      screen = `<unavailable: ${asError(screenError).message}>`;
    }
    return describeChildFailure(error, {
      root: resolvedRoot,
      command,
      exit: live.exit,
      events: channel.events,
      eventChannelFailure: channel.failure,
      screen,
      output: live.output,
    });
  };

  // Every public operation reports failure with the full child context. Applied
  // once, here, rather than as the same three-line try/catch on each member —
  // and this is the only layer that adds diagnostics, so nothing nests. Two
  // helpers rather than one conditional-typed helper: the type gymnastics needed
  // to cover both shapes cost more to read than the duplicated four lines.
  const reporting =
    <A extends unknown[], R>(operation: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await operation(...args);
      } catch (error) {
        throw diagnostic(asError(error));
      }
    };
  const reportingSync =
    <A extends unknown[], R>(operation: (...args: A) => R) =>
    (...args: A): R => {
      try {
        return operation(...args);
      } catch (error) {
        throw diagnostic(asError(error));
      }
    };

  let uncleanExitReason: string | undefined;
  let disposePromise: Promise<void> | undefined;
  const dispose = (): Promise<void> => {
    disposePromise ??= (async () => {
      // Finish the protocol BEFORE terminating the process. The child
      // acknowledges over the same socket with a final sequenced event, giving us
      // a causal boundary: a disconnect before the acknowledgement is the
      // child's failure; process teardown after it belongs to the harness. A
      // timeout is itself a failure, so there is no deadline edge where a queued
      // socket close can be sampled as healthy.
      const protocolFailure = await channel.finish(PROTOCOL_FINISH_MS);

      // The process and its listeners go first; the screen still needs a flush
      // afterwards, and the channel outlives both so a late failure can be read.
      const errors: unknown[] = await live.end();
      for (const step of [
        () => screenModel.flush(),
        () => channel.close(),
        () => screenModel.dispose(),
      ]) {
        try {
          await step();
        } catch (error) {
          errors.push(error);
        }
      }

      // A child that died without finishing the protocol used to be invisible:
      // the test's assertions had already passed and nothing looked here.
      // Read again after channel.close(): malformed input or a queued transport
      // failure recorded during cleanup must not disappear behind an earlier
      // local variable.
      const finalProtocolFailure = channel.failure ?? protocolFailure;
      const expectedPrematureClose =
        uncleanExitReason !== undefined &&
        finalProtocolFailure instanceof EventChannelPrematureCloseError;
      if (finalProtocolFailure !== undefined && !expectedPrematureClose) {
        errors.push(finalProtocolFailure);
      }
      if (errors.length === 1) {
        throw diagnostic(asError(errors[0]));
      }
      if (errors.length > 1) {
        throw diagnostic(new AggregateError(errors, "Failed to dispose the Vite child"));
      }
    })();
    return disposePromise;
  };

  return {
    pid: live.pid,
    get events(): readonly TestEvent[] {
      return channel.events;
    },
    exited: live.exited,
    output: () => live.output,
    expectOutput: reporting((token: string, expectOptions: ExpectOutputOptions = {}) =>
      live.expectOutput(token, { ...expectOptions, abortWhen: () => channel.failure }),
    ),
    screen: reporting(() => screenModel.text()),
    expectEvent: reporting((event: string, expectOptions?: ExpectEventOptions) =>
      channel.expectEvent(event, expectOptions),
    ),
    expectScreen: (predicate, expectOptions) =>
      waitForScreen(channel, screenModel, predicate, diagnostic, expectOptions),
    frame: () => latestCommittedFrame(channel.events),
    // Waits like expectScreen, but decides on the app's own last frame. Prefer it
    // for any claim of the form "the application shows X": the whole screen also
    // carries Vite's coordinated log lines and, inline, scrollback that can never
    // be erased, so a screen-wide match can pass without the app showing anything.
    //
    // Both halves are required — the predicate against the reported frame, and
    // that frame against the real xterm viewport. The frame alone would only
    // prove what the runtime meant to write.
    async expectFrame(predicate, expectOptions) {
      let latest: string | undefined;
      await waitForScreen(
        channel,
        screenModel,
        (screenText) => {
          const rendered = latestCommittedFrame(channel.events);
          latest = rendered;
          return (
            rendered !== undefined &&
            predicate(rendered) &&
            screenShowsFrame(rendered, screenText, visibleRows)
          );
        },
        diagnostic,
        expectOptions,
      );
      return latest ?? "";
    },
    quiesce: reporting((ms: number, quiesceOptions?: QuiesceOptions) =>
      channel.quiesce(ms, quiesceOptions),
    ),
    write: reportingSync((data: string | Buffer) => live.write(data)),
    resize: reporting(async (nextColumns: number, nextRows: number) => {
      live.assertRunning();
      await screenModel.resize(nextColumns, nextRows);
      visibleRows = nextRows;
      live.assertRunning();
      live.resize(nextColumns, nextRows);
    }),
    kill: reportingSync((signal?: string) => live.kill(signal)),
    allowUncleanExit(reason) {
      uncleanExitReason = reason;
    },
    dispose,
  };
}

/** Await the child's exit, failing with the event log instead of a bare timeout. */
export async function childExitWithin(
  child: ViteChild,
  timeoutMs = 20_000,
): Promise<ViteChildExit> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      child.exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              [
                `Vite child ${child.pid} did not exit within ${timeoutMs}ms`,
                "event log:",
                formatEventLog(child.events),
                `PTY output tail: ${JSON.stringify(child.output().slice(-4_096))}`,
              ].join("\n"),
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
