import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import { nextTick, type Component, type ComponentPublicInstance } from "vue";
import {
  createApp,
  type ClipboardTransportResult,
  type MountOptions,
  type TuiApp,
} from "@vue-tui/runtime";
import {
  INTERNAL_SUSPENSION_HOST,
  INTERNAL_TERMINAL_SIZE_PROBE,
  INTERNAL_TEST_INPUT_HOST,
  createManualSuspensionHost,
  observeTuiNodeCreations,
  runtimeResourceTracker,
  yogaNodeTracker,
  type InternalTestInputHost,
  type RuntimeResourceSnapshot,
} from "@vue-tui/runtime/internal";
import { createTestMouse, type TestMouse } from "../../testing/src/mouse.ts";
import { createCapacityTerminalEmulator } from "./emulator.ts";
import { trackCapacityLeakTarget } from "./leak-probe.ts";

export type CapacityResourceSnapshot = RuntimeResourceSnapshot;

export const slowCapacityWritableContract = Object.freeze({
  highWaterMarkBytes: 256,
  firstBackpressureCallbackMs: 200,
  laterCallbackMs: 20,
});

export interface CapacityHostOptions {
  readonly columns: number;
  readonly rows: number;
  readonly mode: NonNullable<MountOptions["mode"]>;
  readonly maxFps?: number;
  readonly clipboard?: (
    text: string,
  ) => ClipboardTransportResult | Promise<ClipboardTransportResult>;
  readonly onRender?: (renderTime: number) => void;
}

export interface CapacityScreen {
  readonly activeBuffer: "normal" | "alternate";
  readonly cursorVisible: boolean;
  readonly text: string;
}

export interface CapacityBackpressureSnapshot {
  readonly highWaterMarkBytes: number;
  readonly writeAttempts: number;
  readonly writeFalseCount: number;
  readonly drainCount: number;
  readonly writesBeforeDrain: number;
  readonly largestAtomicTransactionBytes: number;
  readonly maximumWritableLengthBytes: number;
  readonly currentWritableLengthBytes: number;
  readonly writableNeedDrain: boolean;
  readonly heldBackpressureCallbacks: number;
}

export interface CapacityBackpressureProbe {
  readonly deliveredOutput: string;
  snapshot(): CapacityBackpressureSnapshot;
  waitForIdle(): Promise<void>;
}

export interface CapacityYogaLifecycle {
  readonly liveBefore: number;
  readonly liveAfter: number;
  readonly created: number;
  readonly freed: number;
}

export interface CapacityHost {
  readonly app: TuiApp;
  readonly stdin: NodeJS.ReadStream;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly mouse: TestMouse;
  readonly rawMode: Readonly<{ current: boolean; history: readonly boolean[] }>;
  readonly mouseReporting: TestMouse["reporting"];
  readonly writes: {
    readonly stdout: readonly string[];
    readonly stderr: readonly string[];
  };
  readonly backpressure?: CapacityBackpressureProbe;
  resourceSnapshot(): CapacityResourceSnapshot;
  flush(expectedMarkers?: string | readonly string[]): Promise<CapacityScreen>;
  input(data: string, expectedMarkers?: string | readonly string[]): Promise<CapacityScreen>;
  resize(
    columns: number,
    rows: number,
    expectedMarkers?: string | readonly string[],
  ): Promise<void>;
  suspend(): Promise<void>;
  resume(expectedMarkers?: string | readonly string[]): Promise<void>;
  screen(): Promise<CapacityScreen>;
  dispose(): Promise<{
    readonly resources: RuntimeResourceSnapshot;
    readonly yoga: CapacityYogaLifecycle;
    readonly screen: CapacityScreen;
  }>;
}

function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function makeInput(): {
  readonly stream: NodeJS.ReadStream;
  readonly rawMode: { current: boolean; history: boolean[] };
} {
  const rawMode = { current: false, history: [] as boolean[] };
  const stream = new PassThrough() as unknown as NodeJS.ReadStream & { isRaw: boolean };
  Object.assign(stream, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, mode: boolean) {
      this.isRaw = mode;
      rawMode.current = mode;
      rawMode.history.push(mode);
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
    ref() {},
    unref() {},
  });
  return { stream, rawMode };
}

function makeOutput(columns: number, rows: number): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { columns, rows, isTTY: true });
  return stream;
}

function makeSlowOutput(
  columns: number,
  rows: number,
  deliver: (data: string) => void,
  writes: string[],
): {
  readonly stream: NodeJS.WriteStream;
  readonly probe: CapacityBackpressureProbe;
  beginMeasuredPhase(): void;
} {
  interface Attempt {
    readonly id: number;
    readonly bytes: number;
    readonly returned: boolean;
  }

  const { highWaterMarkBytes, firstBackpressureCallbackMs, laterCallbackMs } =
    slowCapacityWritableContract;
  const queuedAttemptIds: number[] = [];
  const attemptsById = new Map<number, Attempt>();
  const delivered: string[] = [];
  let nextAttemptId = 0;
  let measuredPhase = false;
  let blocked = false;
  let firstBackpressureCallbackHeld = false;
  let writeAttempts = 0;
  let writeFalseCount = 0;
  let drainCount = 0;
  let writesBeforeDrain = 0;
  let largestAtomicTransactionBytes = 0;
  let maximumWritableLengthBytes = 0;
  let heldBackpressureCallbacks = 0;

  const writable = new Writable({
    highWaterMark: highWaterMarkBytes,
    write(chunk: Buffer, _encoding, callback) {
      const attemptId = queuedAttemptIds.shift();
      if (attemptId === undefined) {
        callback(new Error("Slow capacity Writable lost its write-attempt identity."));
        return;
      }
      const value = chunk.toString();
      // Node may enter _write synchronously before Writable.write() returns. A
      // microtask lets the probe observe that return value before selecting the
      // callback delay for the first backpressured transaction.
      queueMicrotask(() => {
        const attempt = attemptsById.get(attemptId);
        if (!attempt) {
          callback(new Error("Slow capacity Writable could not resolve its write attempt."));
          return;
        }
        const holdFirstBackpressure =
          measuredPhase && attempt.returned === false && !firstBackpressureCallbackHeld;
        if (holdFirstBackpressure) {
          firstBackpressureCallbackHeld = true;
          heldBackpressureCallbacks++;
        }
        const delay = measuredPhase
          ? holdFirstBackpressure
            ? firstBackpressureCallbackMs
            : laterCallbackMs
          : 0;
        setTimeout(() => {
          delivered.push(value);
          deliver(value);
          attemptsById.delete(attemptId);
          callback();
        }, delay);
      });
    },
  }) as unknown as NodeJS.WriteStream;
  Object.assign(writable, { columns, rows, isTTY: true });

  const originalWrite = writable.write.bind(writable);
  writable.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
    const id = ++nextAttemptId;
    const value = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    const bytes = Buffer.byteLength(chunk);
    const duringBlockedEpoch = measuredPhase && blocked;
    queuedAttemptIds.push(id);
    const returned = (originalWrite as (...writeArgs: unknown[]) => boolean)(chunk, ...args);
    attemptsById.set(id, Object.freeze({ id, bytes, returned }));
    writes.push(value);
    if (measuredPhase) {
      writeAttempts++;
      if (duringBlockedEpoch) writesBeforeDrain++;
      if (!returned) {
        blocked = true;
        writeFalseCount++;
      }
      largestAtomicTransactionBytes = Math.max(largestAtomicTransactionBytes, bytes);
      maximumWritableLengthBytes = Math.max(maximumWritableLengthBytes, writable.writableLength);
    }
    return returned;
  }) as NodeJS.WriteStream["write"];

  writable.on("drain", () => {
    if (!measuredPhase) return;
    blocked = false;
    drainCount++;
  });

  const probe: CapacityBackpressureProbe = Object.freeze({
    get deliveredOutput() {
      return delivered.join("");
    },
    snapshot() {
      return Object.freeze({
        highWaterMarkBytes,
        writeAttempts,
        writeFalseCount,
        drainCount,
        writesBeforeDrain,
        largestAtomicTransactionBytes,
        maximumWritableLengthBytes,
        currentWritableLengthBytes: writable.writableLength,
        writableNeedDrain: writable.writableNeedDrain,
        heldBackpressureCallbacks,
      });
    },
    async waitForIdle() {
      const deadline = performance.now() + 10_000;
      while (writable.writableLength > 0 || writable.writableNeedDrain) {
        if (performance.now() >= deadline) {
          throw new Error("Slow capacity Writable did not become idle within 10 seconds.");
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
      }
    },
  });

  return {
    stream: writable,
    probe,
    beginMeasuredPhase() {
      if (writable.writableLength !== 0 || writable.writableNeedDrain) {
        throw new Error("Slow capacity Writable must be idle before its measured phase.");
      }
      measuredPhase = true;
      blocked = false;
      firstBackpressureCallbackHeld = false;
      writeAttempts = 0;
      writeFalseCount = 0;
      drainCount = 0;
      writesBeforeDrain = 0;
      largestAtomicTransactionBytes = 0;
      maximumWritableLengthBytes = 0;
      heldBackpressureCallbacks = 0;
    },
  };
}

function markerList(markers: string | readonly string[] | undefined): readonly string[] {
  if (markers === undefined) return [];
  return typeof markers === "string" ? [markers] : markers;
}

export async function mountCapacityHost(
  component: Component,
  options: CapacityHostOptions,
): Promise<CapacityHost> {
  return mountCapacityHostWithOutput(component, options, false);
}

export async function mountSlowCapacityHost(
  component: Component,
  options: CapacityHostOptions,
): Promise<CapacityHost & { readonly backpressure: CapacityBackpressureProbe }> {
  return mountCapacityHostWithOutput(component, options, true) as Promise<
    CapacityHost & { readonly backpressure: CapacityBackpressureProbe }
  >;
}

async function mountCapacityHostWithOutput(
  component: Component,
  options: CapacityHostOptions,
  slow: boolean,
): Promise<CapacityHost> {
  const yogaBefore = yogaNodeTracker.snapshot();
  const emulator = createCapacityTerminalEmulator(options.columns, options.rows);
  emulator.write("PRE_APP_HISTORY\n");
  const stdoutWrites: string[] = [];
  const stderrWrites: string[] = [];
  const slowOutput = slow
    ? makeSlowOutput(options.columns, options.rows, (value) => emulator.write(value), stdoutWrites)
    : undefined;
  const stdout = slowOutput?.stream ?? makeOutput(options.columns, options.rows);
  const stderr = makeOutput(options.columns, options.rows);
  const { stream: stdin, rawMode } = makeInput();
  if (!slowOutput) {
    stdout.on("data", (chunk: Buffer) => {
      const value = chunk.toString();
      stdoutWrites.push(value);
      emulator.write(value);
    });
  }
  stderr.on("data", (chunk: Buffer) => {
    const value = chunk.toString();
    stderrWrites.push(value);
    emulator.write(value);
  });

  const suspensionHost = createManualSuspensionHost();
  let mounted = false;
  let disposed = false;
  let columns = options.columns;
  let rows = options.rows;
  let app!: TuiApp;
  let flushMounted = async (): Promise<void> => undefined;
  const mouseController = createTestMouse({
    columns: () => columns,
    rows: () => rows,
    assertCanEmit() {
      if (!mounted || disposed) throw new Error("The capacity host is not accepting mouse input");
    },
    flush: () => flushMounted(),
  });

  // Arm the slow phase before mount and return without a flush below. The
  // producer therefore runs while the first setup/frame transaction owns the
  // 200ms backpressure epoch instead of starting only after it has drained.
  slowOutput?.beginMeasuredPhase();
  const stopTuiNodeObservation = observeTuiNodeCreations((node) => {
    if (node.type === "root") {
      trackCapacityLeakTarget("tui-root", node);
      trackCapacityLeakTarget("runtime-app-context", node.appContext);
    } else {
      trackCapacityLeakTarget("host-node", node);
    }
  });
  try {
    app = createApp(component);
  } catch (error) {
    stopTuiNodeObservation();
    throw error;
  }
  trackCapacityLeakTarget("tui-app", app);
  trackCapacityLeakTarget("stdin", stdin);
  trackCapacityLeakTarget("stdout", stdout);
  trackCapacityLeakTarget("stderr", stderr);
  const clipboard = options.clipboard
    ? {
        kind: "custom" as const,
        writeText: options.clipboard,
      }
    : undefined;
  let rootProxy: ComponentPublicInstance;
  try {
    rootProxy = app.mount({
      stdout,
      stderr,
      stdin,
      mode: options.mode,
      liveUpdates: true,
      patchConsole: false,
      maxFps: options.maxFps,
      onRender: ({ renderTime }) => options.onRender?.(renderTime),
      kittyKeyboard: { mode: "disabled" },
      clipboard,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
      [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({ kind: "unavailable" }),
      [INTERNAL_TEST_INPUT_HOST]: mouseController.host,
    } as MountOptions & {
      readonly [INTERNAL_SUSPENSION_HOST]: typeof suspensionHost;
      readonly [INTERNAL_TERMINAL_SIZE_PROBE]: () => { readonly kind: "unavailable" };
      readonly [INTERNAL_TEST_INPUT_HOST]: InternalTestInputHost;
    });
  } catch (error) {
    stopTuiNodeObservation();
    throw error;
  }
  trackCapacityLeakTarget("root-proxy", rootProxy);
  mounted = true;

  const privateApp = app as TuiApp & {
    readonly _instance?: object | null;
    readonly _context?: object | null;
  };
  if (isObject(privateApp._instance)) {
    trackCapacityLeakTarget("vue-root-instance", privateApp._instance);
  }
  if (isObject(privateApp._context)) {
    trackCapacityLeakTarget("vue-app-context", privateApp._context);
  }

  async function screen(): Promise<CapacityScreen> {
    const snapshot = await emulator.snapshot();
    return Object.freeze({
      activeBuffer: snapshot.activeBuffer,
      cursorVisible: snapshot.cursor.visible,
      text: [...snapshot.scrollback, ...snapshot.lines].join("\n"),
    });
  }

  async function flush(expectedMarkers?: string | readonly string[]): Promise<CapacityScreen> {
    const markers = markerList(expectedMarkers);
    const deadline = performance.now() + 1_000;
    let snapshot: CapacityScreen;
    while (true) {
      await nextTick();
      await nextTick();
      await app.waitUntilRenderFlush();
      await new Promise<void>((resolve) => setImmediate(resolve));
      await emulator.flush();
      snapshot = await screen();
      if (markers.every((marker) => snapshot.text.includes(marker))) break;
      if (performance.now() >= deadline) {
        const missing = markers.filter((marker) => !snapshot.text.includes(marker));
        assert.fail(
          `visible terminal output is missing ${missing.join(", ")}\n--- terminal tail ---\n${snapshot.text.slice(-10_000)}`,
        );
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 2));
    }
    return snapshot;
  }
  flushMounted = async () => {
    await flush();
  };

  if (!slowOutput) {
    try {
      await flush();
    } catch (error) {
      stopTuiNodeObservation();
      throw error;
    }
  }

  const host = {
    app,
    stdin,
    stdout,
    stderr,
    mouse: mouseController.mouse,
    rawMode,
    mouseReporting: mouseController.mouse.reporting,
    writes: Object.freeze({ stdout: stdoutWrites, stderr: stderrWrites }),
    ...(slowOutput ? { backpressure: slowOutput.probe } : {}),
    resourceSnapshot: () => runtimeResourceTracker.snapshot(),
    flush,
    async input(data: string, expectedMarkers?: string | readonly string[]) {
      (stdin as unknown as NodeJS.WritableStream).write(data);
      return flush(expectedMarkers);
    },
    async resize(
      nextColumns: number,
      nextRows: number,
      expectedMarkers?: string | readonly string[],
    ) {
      columns = nextColumns;
      rows = nextRows;
      Object.assign(stdout, { columns, rows });
      Object.assign(stderr, { columns, rows });
      await emulator.resize(columns, rows);
      stdout.emit("resize");
      await flush(expectedMarkers);
    },
    async suspend() {
      await suspensionHost.suspend();
      await emulator.flush();
    },
    async resume(expectedMarkers?: string | readonly string[]) {
      await suspensionHost.resume();
      await flush(expectedMarkers);
    },
    screen,
    async dispose() {
      if (disposed) throw new Error("The capacity host was already disposed");
      disposed = true;
      try {
        mouseController.clearPressedButtons();
        app.unmount();
        await app.waitUntilExit();
        await slowOutput?.probe.waitForIdle();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise<void>((resolve) => setImmediate(resolve));
        await emulator.flush();
        const finalScreen = await screen();
        const resources = runtimeResourceTracker.snapshot();
        const yogaAfter = yogaNodeTracker.snapshot();
        stdout.destroy();
        stderr.destroy();
        stdin.destroy();
        await emulator.dispose();
        mounted = false;
        return Object.freeze({
          resources,
          yoga: Object.freeze({
            liveBefore: yogaBefore.live,
            liveAfter: yogaAfter.live,
            created: yogaAfter.created - yogaBefore.created,
            freed: yogaAfter.freed - yogaBefore.freed,
          }),
          screen: finalScreen,
        });
      } finally {
        stopTuiNodeObservation();
      }
    },
  } satisfies CapacityHost;
  return Object.freeze(host);
}

export function assertResourcesReleased(snapshot: RuntimeResourceSnapshot): void {
  for (const [kind, count] of Object.entries(snapshot)) {
    assert.equal(count, 0, `${kind} must return to zero after teardown`);
  }
}
