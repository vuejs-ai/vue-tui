import { PassThrough } from "node:stream";
import { nextTick, readonly, type Component } from "vue";
import { createApp, type MountOptions, type RenderSession, type TuiApp } from "@vue-tui/runtime";
import {
  INTERNAL_RENDER_OBSERVER,
  INTERNAL_SUSPENSION_HOST,
  INTERNAL_TERMINAL_SIZE_PROBE,
  createManualSuspensionHost,
  type InternalRenderObserver,
} from "@vue-tui/runtime/internal";
import { createTerminalEmulator, type ScreenSnapshot } from "./emulator.ts";
import { makeFakeStdin, makeFakeWritable, type RawModeState } from "./streams.ts";
import { trackHost } from "./cleanup.ts";

export type TestRenderSession = Extract<RenderSession, { readonly host: "live" }>;

export interface TestHost {
  /** Requested production screen model. @default "inline" */
  readonly mode?: NonNullable<MountOptions["mode"]>;
  /** Renderer presentation. @default "visual" */
  readonly presentation?: "visual" | "screen-reader";
  /** Dynamic output cadence. Defaults to live for a TTY and at-teardown for a stream. */
  readonly updates?: "live" | "at-teardown";
  /** Input stream class. @default "tty" */
  readonly stdin?: "tty" | "non-tty";
  /** Output stream class. @default "tty" */
  readonly stdout?: "tty" | "stream";
}

export interface RenderOptions {
  readonly host?: TestHost;
  /** Deliberate layout and emulator width. @default 100 */
  readonly columns?: number;
  /** Deliberate emulator height and TTY height. @default 100 */
  readonly rows?: number;
  readonly props?: Record<string, unknown>;
}

export interface ContentFrame {
  /**
   * Current dynamic region as emitted by the renderer. This may contain SGR
   * styling, but excludes output-writer lifecycle and screen-update controls.
   */
  readonly dynamic: string;
  /**
   * New `<Static>` content produced by this commit. This may contain SGR
   * styling, but excludes accumulated replay and output-writer controls.
   */
  readonly staticOutput: string;
}

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
  /** Deeply readonly production-like facts visible to the component. */
  readonly session: TestRenderSession;
  /** Runtime-readonly rendering-phase content observations. */
  readonly frames: readonly ContentFrame[];
  lastFrame(this: void, options?: LastFrameOptions): string;
  /** Snapshot terminal state after all currently queued host output. */
  screen(this: void): Promise<ScreenSnapshot>;
  readonly stdin: {
    write(data: string): Promise<void>;
  };
  readonly terminal: Terminal;
  /** Tear down the app while retaining the emulator for restoration assertions. */
  unmount(this: void): void;
  /** Idempotently tear down the app and release every test-host resource. */
  dispose(this: void): void;
  waitUntilExit(this: void): Promise<unknown>;
  waitUntilRenderFlush(this: void): Promise<void>;
}

interface NormalizedTestHost {
  readonly mode: NonNullable<MountOptions["mode"]>;
  readonly presentation: "visual" | "screen-reader";
  readonly updates: "live" | "at-teardown";
  readonly stdin: "tty" | "non-tty";
  readonly stdout: {
    readonly kind: "tty" | "stream";
    readonly columns: number;
    readonly rows: number | undefined;
  };
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

function positiveDimension(value: unknown, name: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  throw new TypeError(`${name} must be a positive safe integer.`);
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
  rejectUnknownKeys(host, ["mode", "presentation", "updates", "stdin", "stdout"], "render host");
  const modeOption = host.mode;
  const presentationOption = host.presentation;
  const updatesOption = host.updates;
  const stdinOption = host.stdin;
  const stdoutOption = host.stdout;

  const mode = modeOption === undefined ? "inline" : modeOption;
  if (mode !== "inline" && mode !== "fullscreen") {
    throw new TypeError('render host mode must be "inline" or "fullscreen".');
  }
  const presentation = presentationOption === undefined ? "visual" : presentationOption;
  if (presentation !== "visual" && presentation !== "screen-reader") {
    throw new TypeError('render host presentation must be "visual" or "screen-reader".');
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
  const rows = kind === "tty" ? emulatorRows : undefined;
  const updates =
    updatesOption === undefined ? (kind === "tty" ? "live" : "at-teardown") : updatesOption;
  if (updates !== "live" && updates !== "at-teardown") {
    throw new TypeError('render host updates must be "live" or "at-teardown".');
  }
  if (propsOption !== undefined) assertObject(propsOption, "render props");

  return {
    props: propsOption as Record<string, unknown> | undefined,
    host: {
      mode,
      presentation,
      updates,
      stdin,
      stdout: { kind, columns, rows },
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
  const suspensionHost = createManualSuspensionHost();
  const forwardOutput = (chunk: Buffer | string) => emulator.write(chunk);
  stdout.on("data", forwardOutput);
  stderr.on("data", forwardOutput);

  const frames: ContentFrame[] = [];
  const publicFrames = readonly(frames) as readonly ContentFrame[];
  let session: TestRenderSession | undefined;
  const observer: InternalRenderObserver = {
    onSession(value) {
      session = value;
    },
    onCommit(commit) {
      if (commit.phase === "teardown") return;
      frames.push(Object.freeze({ dynamic: commit.dynamic, staticOutput: commit.staticOutput }));
    },
  };

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
    app.mount({
      stdout,
      stdin,
      stderr,
      mode: host.mode,
      liveUpdates: host.updates === "live",
      isScreenReaderEnabled: host.presentation === "screen-reader",
      patchConsole: false,
      maxFps: 0,
      [INTERNAL_RENDER_OBSERVER]: observer,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
      [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({ kind: "unavailable" }),
    } as Parameters<TuiApp["mount"]>[0]);
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
    await app.waitUntilRenderFlush();
    await emulator.flush();

    if (earlyError) throw earlyError;
    if (!session) {
      throw new Error("The deterministic render host did not receive a render session.");
    }
  } catch (error) {
    failAfterDispose(error);
  }
  const resolvedSession: TestRenderSession =
    session ??
    failAfterDispose(new Error("The deterministic render host did not receive a render session."));

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
      await emulator.resize(nextColumns, nextRows);
      assertActive();
      emulatorColumns = nextColumns;
      emulatorRows = nextRows;
      stdout.columns = nextColumns;
      if (host.stdout.kind === "tty") stdout.rows = nextRows;
      stderr.columns = nextColumns;
      if (host.stdout.kind === "tty") stderr.rows = nextRows;
      (stdout as unknown as PassThrough).emit("resize");
      await nextTick();
      await app.waitUntilRenderFlush();
      await emulator.flush();
    },
    async suspend() {
      assertActive();
      await suspensionHost.suspend();
      await emulator.flush();
    },
    async resume() {
      assertActive();
      await suspensionHost.resume();
      await nextTick();
      await app.waitUntilRenderFlush();
      await emulator.flush();
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
    session: resolvedSession,
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
      async write(data: string): Promise<void> {
        assertActive();
        stdin.emit("data", data);
        await nextTick();
        await new Promise((resolve) => setTimeout(resolve, 30));
        await nextTick();
        await waitUntilRenderFlush();
      },
    },
    terminal,
    unmount,
    dispose,
    async waitUntilExit() {
      try {
        return await app.waitUntilExit();
      } finally {
        await emulator.flush();
      }
    },
    waitUntilRenderFlush,
  };
}
