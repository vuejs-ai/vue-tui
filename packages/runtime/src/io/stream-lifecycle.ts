import type { Readable, Writable } from "node:stream";
import { acquireRuntimeResource } from "../resource-tracker.ts";

interface TrackedWrite {
  active: boolean;
}

interface WritableState {
  readonly stream: Writable;
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
  trackWrite(stream: Writable): (error?: unknown) => void;
  waitForIdle(): Promise<void>;
  dispose(): void;
}

const streamEventBrokers = new WeakMap<object, StreamEventBroker>();

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

/**
 * Keep one physical listener set per borrowed stream and fan events out to the
 * mounted applications that currently depend on it. Distinct apps may share
 * stderr or stdin, so attaching listeners per app both exceeds EventEmitter's
 * warning threshold and makes one app's cleanup prone to disturbing another.
 */
function subscribeToStreamEvents(
  stream: Readable | Writable,
  subscriber: StreamEventSubscriber,
): () => void {
  let broker = streamEventBrokers.get(stream);
  if (!broker) {
    const subscribers = new Set<StreamEventSubscriber>();
    // Preserve the subscriber set that existed when the physical event began,
    // even when one callback removes itself or another application.
    const snapshotSubscribers = (): StreamEventSubscriber[] => Array.from(subscribers);
    const onError = (error: unknown): void => {
      for (const current of snapshotSubscribers()) current.onError?.(error);
    };
    const onClose = (): void => {
      for (const current of snapshotSubscribers()) current.onClose?.();
    };
    const onFinish = (): void => {
      for (const current of snapshotSubscribers()) current.onFinish?.();
    };
    const onEnd = (): void => {
      for (const current of snapshotSubscribers()) current.onEnd?.();
    };
    const listeners = [
      ["error", onError],
      ["close", onClose],
      ["finish", onFinish],
      ["end", onEnd],
    ] as const;
    const cleanups: Array<() => void> = [];
    try {
      for (const [event, listener] of listeners) {
        stream.on(event, listener);
        const release = acquireRuntimeResource("streamListeners");
        cleanups.push(() => {
          try {
            stream.off(event, listener);
          } finally {
            release();
          }
        });
      }
    } catch (error) {
      runCleanupStack(cleanups);
      throw error;
    }

    let created!: StreamEventBroker;
    created = {
      subscribers,
      dispose() {
        const cleanup = runCleanupStack(cleanups);
        if (streamEventBrokers.get(stream) === created) streamEventBrokers.delete(stream);
        if (cleanup.failed) throw cleanup.error;
      },
    };
    streamEventBrokers.set(stream, created);
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

export function createMountedStreamLifecycle(options: {
  readonly stdin: Readable;
  readonly stdout: Writable;
  readonly stderr: Writable;
  readonly hasManagedInputDemand: () => boolean;
  readonly onFailure: (error: unknown) => void;
}): MountedStreamLifecycle {
  const writableStates = new Map<Writable, WritableState>();
  const stdoutState: WritableState = {
    stream: options.stdout,
    isStdout: true,
    isStderr: options.stderr === options.stdout,
    writes: new Set(),
    stopObserving: null,
  };
  writableStates.set(options.stdout, stdoutState);
  if (options.stderr !== options.stdout) {
    writableStates.set(options.stderr, {
      stream: options.stderr,
      isStdout: false,
      isStderr: true,
      writes: new Set(),
      stopObserving: null,
    });
  }

  const idleWaiters = new Set<() => void>();
  let stopObservingStdin: (() => void) | null = null;
  let active = false;
  let disposed = false;
  let pendingWrites = 0;

  function settleWrite(state: WritableState, write: TrackedWrite): void {
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

  function abandonWrites(state: WritableState): void {
    for (const write of Array.from(state.writes)) settleWrite(state, write);
  }

  function reportWritableLoss(state: WritableState, event: "close" | "finish"): void {
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

  function observeWritableState(state: WritableState): void {
    if (state.stopObserving) return;
    state.stopObserving = subscribeToStreamEvents(state.stream, {
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
      for (const state of writableStates.values()) {
        if (state.isStdout) observeWritableState(state);
      }

      const reportInputLoss = (event: "end" | "close", error?: unknown): void => {
        if (!active || disposed || !options.hasManagedInputDemand()) return;
        options.onFailure(
          error ??
            new Error(
              event === "end"
                ? "Runtime stdin ended while managed input was active."
                : "Runtime stdin closed while managed input was active.",
            ),
        );
      };
      stopObservingStdin = subscribeToStreamEvents(options.stdin, {
        onError(error) {
          reportInputLoss("close", error);
        },
        onEnd() {
          reportInputLoss("end");
        },
        onClose() {
          reportInputLoss("close");
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

  function trackWrite(stream: Writable): (error?: unknown) => void {
    const state = writableStates.get(stream);
    if (!state || disposed) {
      return (error) => {
        if (error !== undefined && error !== null) options.onFailure(error);
      };
    }
    if (!state.isStdout) observeWritableState(state);
    const write: TrackedWrite = { active: true };
    state.writes.add(write);
    pendingWrites++;
    return (error) => {
      if (!write.active) return;
      if (error !== undefined && error !== null) {
        options.onFailure(error);
        // Node reports a failed write callback before emitting the matching
        // stream `error`/`close` events. Keep the shared observer and idle
        // barrier alive through that event turn so Runtime's borrowed listener
        // handles the error instead of exposing an uncaught EventEmitter error.
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
    const stopStdin = stopObservingStdin;
    stopObservingStdin = null;
    try {
      stopStdin?.();
    } catch (error) {
      recordCleanupError(error);
    }
    for (const state of writableStates.values()) {
      const stopWritable = state.stopObserving;
      state.stopObserving = null;
      try {
        stopWritable?.();
      } catch (error) {
        recordCleanupError(error);
      }
      abandonWrites(state);
    }
    if (failed) throw firstError;
  }

  return { activate, trackWrite, waitForIdle, dispose };
}
