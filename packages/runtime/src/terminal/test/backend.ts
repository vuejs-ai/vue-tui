import type {
  TerminalBackend,
  TerminalCapabilities,
  TerminalInputEvent,
  TerminalOutput,
  TerminalOutputEvent,
  TerminalSize,
} from "../backend.ts";
import { createModeLedger } from "../backend.ts";

export interface TestTerminalBackendOptions {
  readonly capabilities?: Partial<{
    readonly stdin: Partial<TerminalCapabilities["stdin"]>;
    readonly stdout: Partial<TerminalCapabilities["stdout"]>;
    readonly stderr: Partial<TerminalCapabilities["stderr"]>;
    readonly environment: Readonly<Record<string, string | undefined>>;
  }>;
  readonly size?: Partial<TerminalSize>;
  readonly writeResults?: Partial<Readonly<Record<TerminalOutput, readonly (boolean | Error)[]>>>;
  readonly onWrite?: (output: TerminalOutput, data: string) => void;
}

/** A deterministic backend for unit tests that do not need Node streams. */
export interface TestTerminalBackend extends TerminalBackend {
  readonly writes: readonly { readonly output: TerminalOutput; readonly data: string }[];
  emitData(data: string | Uint8Array): void;
  emitInput(event: TerminalInputEvent, error?: unknown): void;
  emitOutput(output: TerminalOutput, event: TerminalOutputEvent, error?: unknown): void;
  emitResize(): void;
}

const defaultCapabilities: TerminalCapabilities = Object.freeze({
  stdin: Object.freeze({ isTTY: true, canRead: true, canSetRawMode: true }),
  stdout: Object.freeze({ isTTY: true, canWrite: true }),
  stderr: Object.freeze({ isTTY: true, canWrite: true }),
  environment: Object.freeze({}),
});

/** Create a fixed-capability terminal whose bytes and events are controlled by the test. */
export function createTestTerminalBackend(
  options: TestTerminalBackendOptions = {},
): TestTerminalBackend {
  const capabilities: TerminalCapabilities = Object.freeze({
    stdin: Object.freeze({ ...defaultCapabilities.stdin, ...options.capabilities?.stdin }),
    stdout: Object.freeze({ ...defaultCapabilities.stdout, ...options.capabilities?.stdout }),
    stderr: Object.freeze({ ...defaultCapabilities.stderr, ...options.capabilities?.stderr }),
    environment: options.capabilities?.environment ?? defaultCapabilities.environment,
  });
  const size: TerminalSize = Object.freeze({
    columns: options.size?.columns === undefined ? 80 : options.size.columns,
    rows: options.size?.rows === undefined ? 24 : options.size.rows,
  });
  const writes: Array<{ output: TerminalOutput; data: string }> = [];
  const writeResultIndexes = new Map<TerminalOutput, number>();
  const dataListeners = new Set<(data: string | Uint8Array) => void>();
  const inputListeners = new Map<TerminalInputEvent, Set<(error?: unknown) => void>>();
  const outputListeners = new Map<
    TerminalOutput,
    Map<TerminalOutputEvent, Set<(error?: unknown) => void>>
  >();
  const resizeListeners = new Set<() => void>();
  const modes = createModeLedger();
  // Separate default owners model the ordinary two-stream mount so observers
  // exercise both channels. Callers may still share one owner explicitly.
  const stdoutOwner = {};
  const stderrOwner = {};
  const inputOwner = {};

  const subscribe = <Listener>(listeners: Set<Listener>, listener: Listener): (() => void) => {
    listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);
    };
  };
  const emit = (listeners: ReadonlySet<() => void>): void => {
    for (const listener of Array.from(listeners)) listener();
  };

  const backend: TestTerminalBackend = {
    capabilities,
    size,
    refreshSize() {
      return size;
    },
    outputOwnerFor(output) {
      return output === "stdout" ? stdoutOwner : stderrOwner;
    },
    inputOwner,
    get writes() {
      return writes;
    },
    acquire(mode) {
      return modes.acquire(mode);
    },
    isModeHeld(mode) {
      return modes.isModeHeld(mode);
    },
    setRawMode() {
      // Test mode ownership is modeled through acquire(); raw transitions are inert.
    },
    get isRawModeEnabled() {
      return false;
    },
    refInput() {
      // The deterministic input source does not own an event-loop handle.
    },
    unrefInput() {
      // The deterministic input source does not own an event-loop handle.
    },
    write(output, data, onComplete) {
      const index = writeResultIndexes.get(output) ?? 0;
      writeResultIndexes.set(output, index + 1);
      const result = options.writeResults?.[output]?.[index] ?? capabilities[output].canWrite;
      writes.push({ output, data });
      options.onWrite?.(output, data);
      if (result instanceof Error) throw result;
      onComplete?.();
      return result;
    },
    writeSync(output, data) {
      writes.push({ output, data });
    },
    onOutputEvent(output, event, listener) {
      let events = outputListeners.get(output);
      if (!events) {
        events = new Map();
        outputListeners.set(output, events);
      }
      let listeners = events.get(event);
      if (!listeners) {
        listeners = new Set();
        events.set(event, listeners);
      }
      return subscribe(listeners, listener);
    },
    onData(listener) {
      return subscribe(dataListeners, listener);
    },
    onInputEvent(event, listener) {
      let listeners = inputListeners.get(event);
      if (!listeners) {
        listeners = new Set();
        inputListeners.set(event, listeners);
      }
      return subscribe(listeners, listener);
    },
    onResize(listener) {
      return subscribe(resizeListeners, listener);
    },
    emitData(data) {
      for (const listener of Array.from(dataListeners)) listener(data);
    },
    emitInput(event, error) {
      for (const listener of Array.from(inputListeners.get(event) ?? [])) listener(error);
    },
    emitOutput(output, event, error) {
      for (const listener of Array.from(outputListeners.get(output)?.get(event) ?? [])) {
        listener(error);
      }
    },
    emitResize() {
      emit(resizeListeners);
    },
  };
  return Object.freeze(backend);
}
