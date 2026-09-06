import type { TerminalBackend, TerminalOutput } from "./backend.ts";

interface TrackedWrite {
  active: boolean;
}

interface OutputState {
  readonly output: TerminalOutput;
  readonly isStdout: boolean;
  readonly isStderr: boolean;
  readonly writes: Set<TrackedWrite>;
  stopObserving: (() => void) | null;
}

interface StreamEventSubscriber {
  readonly onError?: (error: unknown) => void;
  readonly onClose?: () => void;
  readonly onFinish?: () => void;
  readonly onEnd?: () => void;
}

interface StreamEventBroker {
  readonly subscribers: Set<StreamEventSubscriber>;
  readonly dispose: () => void;
}

export interface MountedStreamLifecycle {
  activate(): void;
  trackWrite(output: TerminalOutput): (error?: unknown) => void;
  waitForIdle(): Promise<void>;
  dispose(): void;
}

const outputEventBrokers = new WeakMap<object, StreamEventBroker>();
const inputEventBrokers = new WeakMap<object, StreamEventBroker>();

type CleanupStackResult =
  | { readonly failed: false }
  | { readonly failed: true; readonly error: unknown };

function runCleanupStack(cleanups: Array<() => void>): CleanupStackResult {
  let failed = false;
  let firstError: unknown;
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      cleanup();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    }
  }
  return failed ? { failed: true, error: firstError } : { failed: false };
}

function subscribeToOutputEvents(
  terminal: TerminalBackend,
  output: TerminalOutput,
  subscriber: StreamEventSubscriber,
): () => void {
  const owner = terminal.outputOwnerFor(output);
  let broker = outputEventBrokers.get(owner);
  if (!broker) {
    const subscribers = new Set<StreamEventSubscriber>();
    const snapshotSubscribers = (): StreamEventSubscriber[] => Array.from(subscribers);
    const cleanups: Array<() => void> = [];
    try {
      cleanups.push(
        terminal.onOutputEvent(output, "error", (error) => {
          for (const current of snapshotSubscribers()) current.onError?.(error);
        }),
        terminal.onOutputEvent(output, "close", () => {
          for (const current of snapshotSubscribers()) current.onClose?.();
        }),
        terminal.onOutputEvent(output, "finish", () => {
          for (const current of snapshotSubscribers()) current.onFinish?.();
        }),
      );
    } catch (error) {
      runCleanupStack(cleanups);
      throw error;
    }

    let created!: StreamEventBroker;
    created = {
      subscribers,
      dispose() {
        const cleanup = runCleanupStack(cleanups);
        if (outputEventBrokers.get(owner) === created) outputEventBrokers.delete(owner);
        if (cleanup.failed) throw cleanup.error;
      },
    };
    outputEventBrokers.set(owner, created);
    broker = created;
  }

  broker.subscribers.add(subscriber);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    broker!.subscribers.delete(subscriber);
    if (broker!.subscribers.size === 0) broker!.dispose();
  };
}

function subscribeToInputEvents(
  terminal: TerminalBackend,
  subscriber: StreamEventSubscriber,
): () => void {
  const owner = terminal.inputOwner;
  let broker = inputEventBrokers.get(owner);
  if (!broker) {
    const subscribers = new Set<StreamEventSubscriber>();
    const snapshotSubscribers = (): StreamEventSubscriber[] => Array.from(subscribers);
    const cleanups: Array<() => void> = [];
    try {
      cleanups.push(
        terminal.onInputEvent("error", (error) => {
          for (const current of snapshotSubscribers()) current.onError?.(error);
        }),
        terminal.onInputEvent("close", () => {
          for (const current of snapshotSubscribers()) current.onClose?.();
        }),
        terminal.onInputEvent("end", () => {
          for (const current of snapshotSubscribers()) current.onEnd?.();
        }),
      );
    } catch (error) {
      runCleanupStack(cleanups);
      throw error;
    }

    let created!: StreamEventBroker;
    created = {
      subscribers,
      dispose() {
        const cleanup = runCleanupStack(cleanups);
        if (inputEventBrokers.get(owner) === created) inputEventBrokers.delete(owner);
        if (cleanup.failed) throw cleanup.error;
      },
    };
    inputEventBrokers.set(owner, created);
    broker = created;
  }

  broker.subscribers.add(subscriber);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    broker!.subscribers.delete(subscriber);
    if (broker!.subscribers.size === 0) broker!.dispose();
  };
}

/**
 * Observe one mounted backend's borrowed I/O without leaking host streams into
 * the session. Physical listeners are shared by opaque backend identities.
 */
export function createMountedStreamLifecycle(options: {
  readonly terminal: TerminalBackend;
  readonly hasManagedInputDemand: () => boolean;
  readonly onFailure: (error: unknown) => void;
}): MountedStreamLifecycle {
  const stdoutOwner = options.terminal.outputOwnerFor("stdout");
  const stdoutState: OutputState = {
    output: "stdout",
    isStdout: true,
    isStderr: options.terminal.outputOwnerFor("stderr") === stdoutOwner,
    writes: new Set(),
    stopObserving: null,
  };
  const stderrState: OutputState = stdoutState.isStderr
    ? stdoutState
    : {
        output: "stderr",
        isStdout: false,
        isStderr: true,
        writes: new Set(),
        stopObserving: null,
      };
  const outputStates = new Map<TerminalOutput, OutputState>([
    ["stdout", stdoutState],
    ["stderr", stderrState],
  ]);

  const idleWaiters = new Set<() => void>();
  let stopObservingInput: (() => void) | null = null;
  let active = false;
  let disposed = false;
  let pendingWrites = 0;

  function settleWrite(state: OutputState, write: TrackedWrite): void {
    if (!write.active) return;
    write.active = false;
    state.writes.delete(write);
    pendingWrites = Math.max(0, pendingWrites - 1);
    let observerCleanupFailed = false;
    let observerCleanupError: unknown;
    if (!state.isStdout && state.writes.size === 0) {
      const stopObserving = state.stopObserving;
      state.stopObserving = null;
      try {
        stopObserving?.();
      } catch (error) {
        observerCleanupFailed = true;
        observerCleanupError = error;
      }
    }
    if (pendingWrites === 0) {
      for (const resolve of idleWaiters) resolve();
      idleWaiters.clear();
    }
    if (observerCleanupFailed) options.onFailure(observerCleanupError);
  }

  function abandonWrites(state: OutputState): void {
    for (const write of Array.from(state.writes)) settleWrite(state, write);
  }

  function reportWritableLoss(state: OutputState, event: "close" | "finish"): void {
    if (!active || disposed) return;
    const hadPendingWrites = state.writes.size > 0;
    abandonWrites(state);
    if (state.isStdout) {
      options.onFailure(
        new Error(
          event === "finish"
            ? "Runtime stdout ended while the application was active."
            : "Runtime stdout closed while the application was active.",
        ),
      );
    } else if (state.isStderr && hadPendingWrites) {
      options.onFailure(
        new Error(
          event === "finish"
            ? "Runtime stderr ended before an accepted write completed."
            : "Runtime stderr closed before an accepted write completed.",
        ),
      );
    }
  }

  function observeOutputState(state: OutputState): void {
    if (state.stopObserving) return;
    state.stopObserving = subscribeToOutputEvents(options.terminal, state.output, {
      onError(error) {
        if (!active || disposed) return;
        const hadPendingWrites = state.writes.size > 0;
        abandonWrites(state);
        if (state.isStdout || hadPendingWrites) options.onFailure(error);
      },
      onClose() {
        reportWritableLoss(state, "close");
      },
      onFinish() {
        reportWritableLoss(state, "finish");
      },
    });
  }

  function activate(): void {
    if (active || disposed) return;
    active = true;
    try {
      observeOutputState(stdoutState);
      stopObservingInput = subscribeToInputEvents(options.terminal, {
        onError(error) {
          if (!active || disposed || !options.hasManagedInputDemand()) return;
          options.onFailure(error);
        },
      });
    } catch (error) {
      try {
        dispose();
      } catch {
        // Preserve the observer-installation failure that made activation fail.
      }
      throw error;
    }
  }

  function trackWrite(output: TerminalOutput): (error?: unknown) => void {
    const state = outputStates.get(output);
    if (!state || disposed) {
      return (error) => {
        if (error !== undefined && error !== null) options.onFailure(error);
      };
    }
    if (!state.isStdout) observeOutputState(state);
    const write: TrackedWrite = { active: true };
    state.writes.add(write);
    pendingWrites++;
    return (error) => {
      if (!write.active) return;
      if (error !== undefined && error !== null) {
        options.onFailure(error);
        // Keep the shared observer through the matching host-error event turn.
        setImmediate(() => settleWrite(state, write));
        return;
      }
      settleWrite(state, write);
    };
  }

  function waitForIdle(): Promise<void> {
    if (pendingWrites === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      idleWaiters.add(resolve);
    });
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    active = false;
    let failed = false;
    let firstError: unknown;
    const recordCleanupError = (error: unknown): void => {
      if (failed) return;
      failed = true;
      firstError = error;
    };
    const stopInput = stopObservingInput;
    stopObservingInput = null;
    try {
      stopInput?.();
    } catch (error) {
      recordCleanupError(error);
    }
    for (const state of new Set(outputStates.values())) {
      const stopOutput = state.stopObserving;
      state.stopObserving = null;
      try {
        stopOutput?.();
      } catch (error) {
        recordCleanupError(error);
      }
      abandonWrites(state);
    }
    if (failed) throw firstError;
  }

  return { activate, trackWrite, waitForIdle, dispose };
}
