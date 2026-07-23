import { PassThrough } from "node:stream";
import { Console as NodeConsole } from "node:console";
import { nextTick, readonly, type Component } from "vue";
import { createApp, type MountOptions, type TuiApp } from "@vue-tui/runtime";
import { createTestHostBridge, type TestContentFrame } from "@vue-tui/runtime/testing";
import { createTerminalEmulator, type ScreenSnapshot } from "./emulator.ts";
import { makeFakeStdin, makeFakeWritable, type RawModeState } from "./streams.ts";
import { trackHost } from "./cleanup.ts";

export interface TestHost {
  /** Requested production screen model. @default "inline" */
  readonly mode?: NonNullable<MountOptions["mode"]>;
  /** Input stream class. @default "tty" */
  readonly stdin?: "tty" | "non-tty";
  /** Output stream class. @default "tty" */
  readonly stdout?: "tty" | "stream";
  /** Route console output through the modeled Runtime writer. @default false */
  readonly patchConsole?: boolean;
  /** Exit before delivering an exact Ctrl+C key. @default false */
  readonly exitOnCtrlC?: boolean;
}

export interface RenderOptions {
  readonly host?: TestHost;
  /** Deliberate layout and emulator width. @default 100 */
  readonly columns?: number;
  /** Deliberate emulator height and TTY height. @default 100 */
  readonly rows?: number;
  readonly props?: Record<string, unknown>;
}

export type ContentFrame = TestContentFrame;

export interface Terminal {
  readonly columns: number;
  readonly rows: number;
  resize(columns: number, rows: number): Promise<void>;
  /** Temporarily release the modeled terminal without unmounting the app. */
  suspend(): Promise<void>;
  /** Reacquire the modeled terminal, refresh dimensions, and repaint. */
  resume(): Promise<void>;
  readonly rawMode: RawModeState;
}

export interface LastFrameOptions {
  readonly raw?: boolean;
  readonly trimLines?: boolean;
}

export interface RenderResult {
  /** Runtime-readonly rendering-phase content observations. */
  readonly frames: readonly ContentFrame[];
  lastFrame(this: void, options?: LastFrameOptions): string;
  /** Snapshot terminal state after all currently queued host output. */
  screen(this: void): Promise<ScreenSnapshot>;
  readonly stdin: {
    write(data: string | Uint8Array): Promise<void>;
  };
  readonly terminal: Terminal;
  /** Tear down the app while retaining the emulator for restoration assertions. */
  unmount(this: void): void;
  /** Idempotently tear down the app and release every test-host resource. */
  dispose(this: void): void;
  waitUntilExit(this: void): Promise<void>;
  waitUntilRenderFlush(this: void): Promise<void>;
}

interface NormalizedTestHost {
  readonly mode: NonNullable<MountOptions["mode"]>;
  readonly stdin: "tty" | "non-tty";
  readonly stdout: {
    readonly kind: "tty" | "stream";
    readonly columns: number;
    readonly rows: number | undefined;
  };
  readonly patchConsole: boolean;
  readonly exitOnCtrlC: boolean;
  readonly emulatorRows: number;
}

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

function assertObject(value: unknown, name: string): Record<PropertyKey, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value as Record<PropertyKey, unknown>;
}

function rejectUnknownKeys(
  value: Record<PropertyKey, unknown>,
  allowed: readonly string[],
  name: string,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw new TypeError(`Unknown ${name} option "${key}".`);
  }
}

// Match Runtime's accepted terminal-axis envelope before constructing xterm.
// This remains private because applications should not branch on an
// implementation safety limit.
const MAX_MODELED_TERMINAL_AXIS = 65_535;
// xterm allocates storage for the complete modeled viewport even when Runtime's
// Inline renderer would paint only a few rows. Keep that test-only allocation
// bounded independently from Runtime's paint surface.
const MAX_MODELED_TERMINAL_CELLS = 1_048_576;

function positiveDimension(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
  if (value > MAX_MODELED_TERMINAL_AXIS) {
    throw new RangeError(`${name} must be no greater than ${MAX_MODELED_TERMINAL_AXIS}.`);
  }
  return value;
}

function assertModeledTerminalSurface(columns: number, rows: number): void {
  if (columns > Math.floor(MAX_MODELED_TERMINAL_CELLS / rows)) {
    throw new RangeError(
      `modeled terminal ${columns}x${rows} exceeds the ${MAX_MODELED_TERMINAL_CELLS}-cell test-host limit.`,
    );
  }
}

function dimension(value: unknown, fallback: number, name: string): number {
  return value === undefined ? fallback : positiveDimension(value, name);
}

function normalizeOptions(options: RenderOptions): {
  readonly props: Record<string, unknown> | undefined;
  readonly host: NormalizedTestHost;
} {
  const root = assertObject(options, "render options");
  for (const removed of ["liveUpdates", "debug"] as const) {
    if (hasOwn(root, removed)) {
      throw new TypeError(`render option "${removed}" was removed; configure the modeled host.`);
    }
  }
  rejectUnknownKeys(root, ["host", "columns", "rows", "props"], "render");

  // Snapshot each accessor once. Validation and construction must use the same
  // value so a stateful getter cannot pass one check and mount with another.
  const hostOption = root.host;
  const columnsOption = root.columns;
  const rowsOption = root.rows;
  const propsOption = root.props;

  const host = hostOption === undefined ? {} : assertObject(hostOption, "render host");
  rejectUnknownKeys(
    host,
    ["mode", "stdin", "stdout", "patchConsole", "exitOnCtrlC"],
    "render host",
  );
  const modeOption = host.mode;
  const stdinOption = host.stdin;
  const stdoutOption = host.stdout;
  const patchConsoleOption = host.patchConsole;
  const exitOnCtrlCOption = host.exitOnCtrlC;

  const mode = modeOption === undefined ? "inline" : modeOption;
  if (mode !== "inline" && mode !== "fullscreen") {
    throw new TypeError('render host mode must be "inline" or "fullscreen".');
  }
  const stdin = stdinOption === undefined ? "tty" : stdinOption;
  if (stdin !== "tty" && stdin !== "non-tty") {
    throw new TypeError('render host stdin must be "tty" or "non-tty".');
  }

  const kind = stdoutOption === undefined ? "tty" : stdoutOption;
  if (kind !== "tty" && kind !== "stream") {
    throw new TypeError('render host stdout must be "tty" or "stream".');
  }
  const columns = dimension(columnsOption, 100, "render columns");
  const emulatorRows = dimension(rowsOption, 100, "render rows");
  assertModeledTerminalSurface(columns, emulatorRows);
  const rows = kind === "tty" ? emulatorRows : undefined;
  const patchConsole = patchConsoleOption === undefined ? false : patchConsoleOption;
  if (typeof patchConsole !== "boolean") {
    throw new TypeError("render host patchConsole must be a boolean.");
  }
  const exitOnCtrlC = exitOnCtrlCOption === undefined ? false : exitOnCtrlCOption;
  if (typeof exitOnCtrlC !== "boolean") {
    throw new TypeError("render host exitOnCtrlC must be a boolean.");
  }
  if (propsOption !== undefined) assertObject(propsOption, "render props");

  return {
    props: propsOption as Record<string, unknown> | undefined,
    host: {
      mode,
      stdin,
      stdout: { kind, columns, rows },
      patchConsole,
      exitOnCtrlC,
      emulatorRows,
    },
  };
}

function trimFrame(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();
}

export async function render(
  component: Component,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const normalized = normalizeOptions(options);
  const { host } = normalized;
  const stdout = makeFakeWritable({
    isTTY: host.stdout.kind === "tty",
    columns: host.stdout.columns,
    rows: host.stdout.rows,
  });
  const stderr = makeFakeWritable({
    isTTY: host.stdout.kind === "tty",
    columns: host.stdout.columns,
    rows: host.stdout.rows,
  });
  const { stream: stdin, rawMode } = makeFakeStdin({ isTTY: host.stdin === "tty" });
  const publicRawMode = readonly(rawMode) as RawModeState;
  const emulator = createTerminalEmulator(host.stdout.columns, host.emulatorRows, {
    convertEol: host.stdout.kind === "tty",
  });
  const forwardOutput = (chunk: Buffer | string) => emulator.write(chunk);
  stdout.on("data", forwardOutput);
  stderr.on("data", forwardOutput);

  const frames: ContentFrame[] = [];
  const publicFrames = readonly(frames) as readonly ContentFrame[];
  const bridge = createTestHostBridge({ onFrame: (frame) => frames.push(frame) });

  const app: TuiApp = createApp(component, normalized.props);
  let resourcesDisposed = false;
  const disposeResources = () => {
    if (resourcesDisposed) return;
    resourcesDisposed = true;
    const errors: unknown[] = [];
    const release = (operation: () => void) => {
      try {
        operation();
      } catch (error) {
        errors.push(error);
      }
    };
    release(() => stdout.off("data", forwardOutput));
    release(() => stderr.off("data", forwardOutput));
    release(() => stdout.destroy());
    release(() => stderr.destroy());
    release(() => stdin.destroy());
    release(() => emulator.dispose());
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "Failed to release test-host resources.");
    }
  };
  let unmounted = false;
  const unmount = () => {
    if (unmounted) return;
    unmounted = true;
    app.unmount();
  };
  let disposed = false;
  let untrack: () => void = () => undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const errors: unknown[] = [];
    try {
      unmount();
    } catch (error) {
      errors.push(error);
    }
    untrack();
    try {
      disposeResources();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Failed to dispose the test host.");
  };
  const assertActive = () => {
    if (disposed) throw new Error("Test host has been disposed.");
  };
  const flushEmulatorWhileAvailable = async (): Promise<void> => {
    if (disposed) return;
    try {
      await emulator.flush();
    } catch (error) {
      // A waitUntilExit() call may already be waiting when test cleanup
      // disposes the host. Preserve the Runtime exit outcome instead of
      // replacing it with the emulator's later disposal error.
      if (disposed) return;
      throw error;
    }
  };
  const settleRuntimeRender = async (): Promise<void> => {
    try {
      await app.waitUntilRenderFlush();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "waitUntilRenderFlush() is only available while the app is mounted"
      ) {
        // A render error can tear the app down before this test-host barrier.
        // waitUntilExit() carries the original application error (or the
        // successful result of a deliberate early exit).
        await app.waitUntilExit();
        return;
      }
      throw error;
    }
  };
  const failAfterDispose = (error: unknown): never => {
    try {
      dispose();
    } catch (disposeError) {
      throw new AggregateError(
        [error, disposeError],
        "Failed to initialize and dispose the test host.",
      );
    }
    throw error;
  };

  try {
    const consoleDescriptor = Object.getOwnPropertyDescriptor(console, "Console");
    if (host.patchConsole && typeof (console as { Console?: unknown }).Console !== "function") {
      Object.defineProperty(console, "Console", {
        configurable: true,
        writable: true,
        value: NodeConsole,
      });
    }
    try {
      bridge.mount(app, {
        stdout,
        stdin,
        stderr,
        mode: host.mode,
        patchConsole: host.patchConsole,
        exitOnCtrlC: host.exitOnCtrlC,
      });
    } finally {
      if (host.patchConsole) {
        if (consoleDescriptor) Object.defineProperty(console, "Console", consoleDescriptor);
        else Reflect.deleteProperty(console, "Console");
      }
    }
  } catch (error) {
    failAfterDispose(error);
  }

  untrack = trackHost(dispose);

  let earlyError: Error | undefined;
  try {
    app.waitUntilExit().catch((error) => {
      earlyError = error as Error;
    });

    await nextTick();
    await nextTick();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await Promise.resolve();
    await settleRuntimeRender();
    await emulator.flush();

    if (earlyError) throw earlyError;
  } catch (error) {
    failAfterDispose(error);
  }

  let emulatorColumns = host.stdout.columns;
  let emulatorRows = host.emulatorRows;
  const terminal: Terminal = {
    get columns() {
      return emulatorColumns;
    },
    get rows() {
      return emulatorRows;
    },
    async resize(columns: number, rows: number) {
      assertActive();
      const nextColumns = positiveDimension(columns, "terminal columns");
      const nextRows = positiveDimension(rows, "terminal rows");
      assertModeledTerminalSurface(nextColumns, nextRows);
      await emulator.resize(nextColumns, nextRows);
      assertActive();
      emulatorColumns = nextColumns;
      emulatorRows = nextRows;
      stdout.columns = nextColumns;
      if (host.stdout.kind === "tty") stdout.rows = nextRows;
      stderr.columns = nextColumns;
      if (host.stdout.kind === "tty") stderr.rows = nextRows;
      if (unmounted) return;
      (stdout as unknown as PassThrough).emit("resize");
      await nextTick();
      if (unmounted) return;
      await settleRuntimeRender();
      await emulator.flush();
    },
    async suspend() {
      assertActive();
      await bridge.suspend();
      await emulator.flush();
    },
    async resume() {
      assertActive();
      await bridge.resume();
      await emulator.flush();
      assertActive();
    },
    rawMode: publicRawMode,
  };

  const waitUntilRenderFlush = async (): Promise<void> => {
    assertActive();
    await app.waitUntilRenderFlush();
    assertActive();
    await emulator.flush();
  };

  return {
    frames: publicFrames,
    lastFrame: (frameOptions?: LastFrameOptions) => {
      const frame = frames.at(-1)?.dynamic ?? "";
      if (frameOptions?.raw) return frame;
      if (frameOptions?.trimLines) {
        return frame
          .split("\n")
          .map((line) => line.trimEnd())
          .join("\n");
      }
      return trimFrame(frame);
    },
    screen: async () => {
      assertActive();
      return await emulator.snapshot();
    },
    stdin: {
      async write(data: string | Uint8Array): Promise<void> {
        assertActive();
        await bridge.writeInput(data);
        await emulator.flush();
      },
    },
    terminal,
    unmount,
    dispose,
    async waitUntilExit() {
      assertActive();
      try {
        return await app.waitUntilExit();
      } finally {
        await flushEmulatorWhileAvailable();
      }
    },
    waitUntilRenderFlush,
  };
}
