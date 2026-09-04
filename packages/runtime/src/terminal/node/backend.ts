import { writeSync as fsWriteSync } from "node:fs";
import process from "node:process";
import type { Readable, Writable } from "node:stream";
import { createNodeProcessLifecycle, type NodeProcessLifecycle } from "./lifecycle.ts";
import type { SuspensionHost } from "./process-suspension.ts";
import type {
  TerminalBackend,
  TerminalCapabilities,
  TerminalInputEvent,
  TerminalLease,
  TerminalMode,
  TerminalOutput,
  TerminalOutputCapabilities,
  TerminalOutputEvent,
  TerminalSize,
} from "../backend.ts";
import { createModeLedger } from "../backend.ts";
import {
  probeControllingTerminalSize,
  type TerminalSizeProbe,
  type TerminalSizeProbeResult,
} from "./terminal-size-probe.ts";

type NodeReadable = NodeJS.ReadStream & {
  readonly readable?: boolean;
  readonly readableEnded?: boolean;
  readonly isRaw?: boolean;
  readonly setRawMode?: (enabled: boolean) => unknown;
  readonly ref?: () => unknown;
  readonly unref?: () => unknown;
  readonly resume?: () => unknown;
  readonly pause?: () => unknown;
};

type NodeWritable = NodeJS.WriteStream & {
  readonly writable?: boolean;
  readonly writableEnded?: boolean;
  readonly writableLength?: number;
  readonly _writableState?: unknown;
};

export interface NodeTerminalBackendOptions {
  readonly stdin: unknown;
  readonly stdout: unknown;
  readonly stderr: unknown;
  /** Process environment the colour probe and capability facts read; defaults to `process.env`. */
  readonly environment?: Readonly<Record<string, string | undefined>>;
  /** Repository-only deterministic replacement for controlling-terminal size detection. */
  readonly sizeProbe?: TerminalSizeProbe;
}

export interface NodeTerminalBackendLifecycleOptions {
  /** Deterministic mounts replace job-control signals without changing streams. */
  readonly suspensionHost?: SuspensionHost;
}

function isReadable(value: unknown): value is Readable {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as Readable).on === "function" &&
    typeof (value as Readable).once === "function" &&
    typeof (value as Readable).off === "function"
  );
}

function isWritable(value: unknown): value is Writable {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as Writable).write === "function" &&
    typeof (value as Writable).on === "function" &&
    typeof (value as Writable).once === "function" &&
    typeof (value as Writable).off === "function"
  );
}

function assertWritable(value: unknown, option: "stdout" | "stderr"): asserts value is Writable {
  if (!isWritable(value)) {
    throw new TypeError(`Mount option "${option}" must be a Node Writable stream.`);
  }
  const stream = value as NodeWritable;
  if (stream.destroyed || stream.writableEnded || stream.writable === false) {
    throw new Error(`Mount option "${option}" must be writable when mount() begins.`);
  }
}

function assertReadable(value: unknown): asserts value is Readable {
  if (!isReadable(value)) {
    throw new TypeError('Mount option "stdin" must be a Node Readable stream.');
  }
}

function canWrite(stream: NodeWritable): boolean {
  return !stream.destroyed && !stream.writableEnded && stream.writable !== false;
}

function canRead(stream: NodeReadable): boolean {
  return !stream.destroyed && !stream.readableEnded && stream.readable !== false;
}

/**
 * The platform window-size contract carries rows and columns as unsigned 16-bit
 * fields (`struct winsize`), so a reported dimension beyond this did not come
 * from a terminal window. `terminal/` imports nothing, so this backend states
 * its own limit; `layout/` keeps `MAX_LAYOUT_VALUE` for the layout envelope,
 * and the two numbers coincide only because that envelope is chosen to hold a
 * whole window.
 */
const MAX_WINDOW_DIMENSION = 65_535;

function positiveCellCount(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_WINDOW_DIMENSION
    ? value
    : null;
}

const unavailableSizeProbe = (): TerminalSizeProbeResult => ({ kind: "unavailable" });

function environmentWithoutColorControls(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(environment)) {
    if (
      value === undefined ||
      name === "FORCE_COLOR" ||
      name === "NO_COLOR" ||
      name === "NODE_DISABLE_COLORS"
    ) {
      continue;
    }
    result[name] = value;
  }
  return result;
}

function colorDepthOf(
  stream: NodeWritable,
  environment: Readonly<Record<string, string | undefined>>,
): number | undefined {
  return (
    stream as NodeWritable & {
      readonly getColorDepth?: (environment?: Record<string, string | undefined>) => number;
    }
  ).getColorDepth?.(environmentWithoutColorControls(environment));
}

function outputCapabilitiesFor(
  stream: NodeWritable,
  environment: Readonly<Record<string, string | undefined>>,
): TerminalOutputCapabilities {
  return Object.freeze({
    isTTY: stream.isTTY === true,
    canWrite: canWrite(stream),
    colorDepth: colorDepthOf(stream, environment),
  });
}

/** Read the process default output only for renderToString({ color: true }). */
export function getDefaultNodeColorFacts(): {
  readonly stdout: TerminalOutputCapabilities;
  readonly environment: Readonly<Record<string, string | undefined>>;
} {
  const environment = process.env;
  return Object.freeze({
    stdout: outputCapabilitiesFor(process.stdout as NodeWritable, environment),
    environment,
  });
}

/** Node environment policy for host diagnostics that do not need a stream. */
export function isNodeProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Node implementation of the terminal boundary. Raw streams remain private to
 * this directory; callers above it use output names, host facts, and leases.
 */
export class NodeTerminalBackend implements TerminalBackend {
  readonly #stdin: NodeReadable;
  readonly #stdout: NodeWritable;
  readonly #stderr: NodeWritable;
  readonly #dataListeners = new Set<(data: string | Uint8Array) => void>();
  private readonly modes = createModeLedger();
  readonly #colorDepths = new Map<TerminalOutput, number | undefined>();
  #inputFlowOwned = false;
  #reconcilingInputFlow = false;
  #inputFlowReconcileRequested = false;
  readonly #environment: Readonly<Record<string, string | undefined>>;
  readonly #sizeProbe: TerminalSizeProbe;
  readonly #freshSizeProbe: TerminalSizeProbe;
  readonly #processLifecycle: NodeProcessLifecycle;
  readonly capabilities: TerminalCapabilities;

  constructor(
    options: NodeTerminalBackendOptions,
    lifecycleOptions: NodeTerminalBackendLifecycleOptions = {},
  ) {
    const stdin = options.stdin;
    const stdout = options.stdout;
    const stderr = options.stderr;
    assertReadable(stdin);
    assertWritable(stdout, "stdout");
    assertWritable(stderr, "stderr");
    this.#stdin = stdin as NodeReadable;
    this.#stdout = stdout as NodeWritable;
    this.#stderr = stderr as NodeWritable;
    this.#environment = options.environment ?? process.env;
    const usesProcessOutput =
      options.sizeProbe === undefined &&
      (this.#stdout === process.stdout || this.#stdout === process.stderr);
    this.#sizeProbe =
      options.sizeProbe ??
      (usesProcessOutput ? probeControllingTerminalSize : unavailableSizeProbe);
    this.#freshSizeProbe =
      options.sizeProbe ??
      (usesProcessOutput
        ? () =>
            probeControllingTerminalSize({
              stdout: undefined,
              stderr: undefined,
              env: {},
            })
        : unavailableSizeProbe);
    this.#processLifecycle = createNodeProcessLifecycle(lifecycleOptions);

    const inputStream = this.#stdin;
    const outputStream = this.#stdout;
    const rawModeSupported = (): boolean => this.isRawModeSupported();
    const colorDepthFor = (stream: NodeWritable, output: TerminalOutput): number | undefined =>
      this.colorDepthFor(stream, output);
    const outputFacts = (
      stream: NodeWritable,
      output: TerminalOutput,
    ): TerminalOutputCapabilities =>
      Object.freeze({
        get isTTY() {
          return stream.isTTY === true;
        },
        get canWrite() {
          return canWrite(stream);
        },
        get colorDepth() {
          return colorDepthFor(stream, output);
        },
      });
    this.capabilities = Object.freeze({
      stdin: Object.freeze({
        get isTTY() {
          return inputStream.isTTY === true;
        },
        get canRead() {
          return canRead(inputStream);
        },
        get canSetRawMode() {
          // A readable TTY beside redirected stdout is a document host: it may
          // deliver ordinary input, but Runtime must not negotiate raw input.
          return outputStream.isTTY === true && rawModeSupported();
        },
      }),
      stdout: outputFacts(this.#stdout, "stdout"),
      stderr: outputFacts(this.#stderr, "stderr"),
      environment: this.#environment,
    });
  }

  /** Process exits and job-control signals belong to the Node terminal backend. */
  get processLifecycle(): NodeProcessLifecycle {
    return this.#processLifecycle;
  }

  get size(): TerminalSize {
    return this.readSize(this.#sizeProbe, false);
  }

  refreshSize(): TerminalSize {
    return this.readSize(this.#freshSizeProbe, true);
  }

  outputOwnerFor(output: TerminalOutput): object {
    return this.outputStream(output);
  }

  get inputOwner(): object {
    return this.#stdin;
  }

  /** The documented useStdin() escape hatch receives this exact mounted stream. */
  get stdinForUseStdin(): Readable {
    return this.#stdin;
  }

  isRawModeSupported(): boolean {
    return this.#stdin.isRaw === true || typeof this.#stdin.setRawMode === "function";
  }

  get isRawModeEnabled(): boolean {
    return this.#stdin.isRaw === true;
  }

  setRawMode(enabled: boolean): void {
    if (typeof this.#stdin.setRawMode !== "function") {
      throw new Error("Raw mode is unavailable because Runtime cannot control the mounted stdin.");
    }
    this.#stdin.setRawMode(enabled);
  }

  refInput(): void {
    this.#stdin.ref?.();
  }

  unrefInput(): void {
    this.#stdin.unref?.();
  }

  acquire<Mode extends TerminalMode>(mode: Mode): TerminalLease<Mode> {
    return this.modes.acquire(mode);
  }

  isModeHeld(mode: TerminalMode): boolean {
    return this.modes.isModeHeld(mode);
  }

  write(
    output: TerminalOutput,
    data: string,
    onComplete?: (error?: Error | null) => void,
  ): boolean {
    const stream = this.outputStream(output);
    if (!onComplete) return stream.write(data);
    const hasWritableState =
      stream._writableState !== undefined || stream.writableLength !== undefined;
    if (hasWritableState) return stream.write(data, onComplete);
    const writable = stream.write(data);
    setImmediate(onComplete);
    return writable;
  }

  writeSync(output: TerminalOutput, data: string): void {
    const stream = this.outputStream(output);
    const descriptor = (stream as { readonly fd?: unknown }).fd;
    if (typeof descriptor === "number") {
      fsWriteSync(descriptor, data);
      return;
    }
    if (stream === process.stdout) {
      fsWriteSync(1, data);
      return;
    }
    if (stream === process.stderr) {
      fsWriteSync(2, data);
      return;
    }
    stream.write(data);
  }

  onOutputEvent(
    output: TerminalOutput,
    event: TerminalOutputEvent,
    listener: (error?: unknown) => void,
  ): () => void {
    const stream = this.outputStream(output);
    stream.on(event, listener);
    let active = true;
    return () => {
      if (!active) return;
      stream.off(event, listener);
      active = false;
    };
  }

  onData(listener: (data: string | Uint8Array) => void): () => void {
    const registeredListener = (data: string | Uint8Array): void => listener(data);
    const canObserveFlow = "readableFlowing" in this.#stdin;
    if (
      canObserveFlow &&
      this.#inputFlowOwned &&
      !this.#reconcilingInputFlow &&
      this.#stdin.listenerCount("data") === 0 &&
      this.#stdin.readableFlowing === true
    ) {
      // Outside code changed the detached baseline by resuming the input.
      this.#inputFlowOwned = false;
    }
    if (
      canObserveFlow &&
      this.#stdin.readableFlowing !== true &&
      this.#stdin.listenerCount("data") === 0
    ) {
      this.#inputFlowOwned = true;
    }
    this.#dataListeners.add(registeredListener);
    try {
      this.#stdin.on("data", registeredListener);
      this.reconcileInputFlow();
    } catch (error) {
      try {
        this.#stdin.off("data", registeredListener);
      } catch {
        // Preserve the original subscription failure.
      }
      if (!this.#stdin.listeners("data").includes(registeredListener)) {
        this.#dataListeners.delete(registeredListener);
      }
      try {
        this.reconcileInputFlow();
      } catch {
        // Preserve the listener or flow acquisition failure.
      }
      throw error;
    }
    let active = true;
    return () => {
      if (!active) return;
      this.#stdin.off("data", registeredListener);
      this.#dataListeners.delete(registeredListener);
      this.reconcileInputFlow();
      active = false;
    };
  }

  onInputEvent(event: TerminalInputEvent, listener: (error?: unknown) => void): () => void {
    this.#stdin.on(event, listener);
    let active = true;
    return () => {
      if (!active) return;
      this.#stdin.off(event, listener);
      active = false;
    };
  }

  onResize(listener: () => void): () => void {
    this.#stdout.on("resize", listener);
    let active = true;
    return () => {
      if (!active) return;
      this.#stdout.off("resize", listener);
      active = false;
    };
  }

  private outputStream(output: TerminalOutput): NodeWritable {
    return output === "stdout" ? this.#stdout : this.#stderr;
  }

  private externalDataListenerCount(): number {
    let ownListeners = 0;
    for (const listener of this.#stdin.listeners("data")) {
      if (this.#dataListeners.has(listener as (data: string | Uint8Array) => void)) {
        ownListeners++;
      }
    }
    return Math.max(0, this.#stdin.listenerCount("data") - ownListeners);
  }

  private colorDepthFor(stream: NodeWritable, output: TerminalOutput): number | undefined {
    if (!this.#colorDepths.has(output)) {
      this.#colorDepths.set(output, colorDepthOf(stream, this.#environment));
    }
    return this.#colorDepths.get(output);
  }

  private readSize(probe: TerminalSizeProbe, preferProbe: boolean): TerminalSize {
    const direct = {
      columns: positiveCellCount(this.#stdout.columns),
      rows: positiveCellCount(this.#stdout.rows),
    };
    if (!this.capabilities.stdout.isTTY) return Object.freeze(direct);
    if (!preferProbe && direct.columns !== null && direct.rows !== null) {
      return Object.freeze(direct);
    }
    const result = probe();
    if (result.kind === "detected") {
      const columns = positiveCellCount(result.size.columns);
      const rows = positiveCellCount(result.size.rows);
      if (columns !== null && rows !== null) return Object.freeze({ columns, rows });
    }
    return Object.freeze(direct);
  }

  private reconcileInputFlow(): void {
    if (!("readableFlowing" in this.#stdin)) return;
    if (this.#reconcilingInputFlow) {
      this.#inputFlowReconcileRequested = true;
      return;
    }

    this.#reconcilingInputFlow = true;
    let firstError: unknown;
    try {
      while (true) {
        if (firstError !== undefined && !this.#inputFlowReconcileRequested) break;
        this.#inputFlowReconcileRequested = false;
        const externalListeners = this.externalDataListenerCount();
        if (externalListeners > 0) {
          // An external data owner controls its own paused/flowing state.
          this.#inputFlowOwned = false;
          break;
        }

        const hasRuntimeListener = this.#dataListeners.size > 0;
        if (!this.#inputFlowOwned) {
          if (!hasRuntimeListener || this.#stdin.readableFlowing === true) break;
          this.#inputFlowOwned = true;
        }

        const shouldFlow = hasRuntimeListener;
        if (shouldFlow === (this.#stdin.readableFlowing === true)) {
          if (!this.#inputFlowReconcileRequested) break;
          continue;
        }

        const before = this.#stdin.readableFlowing;
        try {
          if (shouldFlow) this.#stdin.resume?.();
          else if (typeof this.#stdin.pause === "function") {
            const externalBeforePause = this.externalDataListenerCount();
            this.#stdin.pause();
            if (
              externalBeforePause === 0 &&
              this.externalDataListenerCount() > 0 &&
              this.#stdin.readableFlowing !== true &&
              typeof this.#stdin.resume === "function"
            ) {
              this.#inputFlowOwned = false;
              this.#stdin.resume();
            }
          } else break;
        } catch (error) {
          firstError ??= error;
        }
        if (firstError !== undefined && this.#inputFlowReconcileRequested) continue;
        if (firstError !== undefined) break;
        if (this.#stdin.readableFlowing === before && !this.#inputFlowReconcileRequested) break;
      }
    } finally {
      this.#reconcilingInputFlow = false;
    }
    if (firstError !== undefined) throw firstError;
  }
}

/** Resolve borrowed streams and their process defaults inside the Node backend. */
export function createNodeTerminalBackend(
  options: {
    readonly stdin?: unknown;
    readonly stdout?: unknown;
    readonly stderr?: unknown;
    readonly sizeProbe?: TerminalSizeProbe;
  },
  lifecycleOptions?: NodeTerminalBackendLifecycleOptions,
): NodeTerminalBackend {
  return new NodeTerminalBackend(
    {
      stdin: options.stdin ?? process.stdin,
      stdout: options.stdout ?? process.stdout,
      stderr: options.stderr ?? process.stderr,
      sizeProbe: options.sizeProbe,
    },
    lifecycleOptions,
  );
}
