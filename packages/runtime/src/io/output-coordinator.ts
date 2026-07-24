import { acquireRuntimeResource } from "../resource-tracker.ts";

/**
 * Result of one Runtime-coordinated side-output transaction.
 *
 * A Node Writable accepts a chunk even when `write()` returns `false`. The
 * `writable` flag therefore reports whether another transaction may begin; it
 * does not change whether this transaction was accepted. Calls made while an
 * earlier transaction owns the gate are not retained and report `blocked`.
 */
export type CoordinatedWriteResult =
  | {
      readonly status: "accepted";
      readonly writable: true;
    }
  | {
      readonly status: "accepted";
      readonly writable: false;
      readonly ready: Promise<void>;
    }
  | {
      readonly status: "blocked";
      readonly ready: Promise<void>;
    };

interface PendingWrite {
  readonly stream: NodeJS.WriteStream;
  data: string;
  readonly callback?: () => void;
  onHandoff?: () => void;
}

interface TransactionState {
  readonly pending: PendingWrite[];
  readonly ready: Promise<void>;
  readonly resolveReady: () => void;
  readonly rejectReady: (error: unknown) => void;
  readonly onUnhandedFailure?: (error: unknown) => void;
  readonly onFullyHanded?: () => void;
  bodyActive: boolean;
  handoffStarted: boolean;
  fullyHanded: boolean;
  hadBackpressure: boolean;
  failureReported: boolean;
  fullyHandedReported: boolean;
  failed: boolean;
  failure: unknown;
}

type ListenerCleanupResult =
  | { readonly failed: false }
  | { readonly failed: true; readonly error: unknown };

export interface OutputCoordinator {
  /** Whether one building, handed, or backpressured transaction owns the gate. */
  readonly isBlocked: () => boolean;
  /** Resolve when the current transaction has handed every segment and drained. */
  readonly waitForIdle: () => Promise<void>;
  /**
   * Begin one caller-visible transaction. While the gate is owned, `body` is
   * not invoked and no payload is retained.
   */
  readonly run: (
    body: () => void,
    options?: {
      readonly onFullyHanded?: () => void;
      readonly onUnhandedFailure?: (error: unknown) => void;
    },
  ) => CoordinatedWriteResult;
  /**
   * Join the currently-building Runtime transaction, or start one while idle.
   * It never appends to an already-handed or backpressured transaction.
   */
  readonly continue: (body: () => void) => CoordinatedWriteResult;
  /** Capture one ordered segment inside the current building transaction. */
  readonly write: (
    stream: NodeJS.WriteStream,
    data: string,
    callback?: () => void,
    onHandoff?: () => void,
  ) => boolean;
  /**
   * Hand every captured segment to its stream now. Returns false only when a
   * prior segment backpressured and later cross-stream segments remain.
   */
  readonly handoff: () => boolean;
  /** Drop an owned transaction before an emergency synchronous terminal transition. */
  readonly abort: (error: unknown) => void;
}

const acceptedWritable = Object.freeze({
  status: "accepted",
  writable: true,
}) satisfies CoordinatedWriteResult;

/**
 * Coordinate one application's Runtime-owned stdout and stderr traffic.
 *
 * A transaction first captures all logical chunks. Adjacent chunks for the
 * same stream are combined, so ordinary stdout-only frames are handed to Node
 * with one physical `write()`. Cross-stream order is retained as a small
 * segment list. Once any segment returns false, no later segment is handed
 * until `drain`.
 */
export function createOutputCoordinator(options?: {
  readonly onDeferredError?: (error: unknown) => void;
  readonly trackWrite?: (stream: NodeJS.WriteStream) => (error?: unknown) => void;
}): OutputCoordinator {
  type State = "idle" | "building" | "backpressured";
  let state: State = "idle";
  let transaction: TransactionState | null = null;
  let removeWaitListeners: (() => ListenerCleanupResult) | null = null;

  function newTransaction(runOptions?: {
    readonly onFullyHanded?: () => void;
    readonly onUnhandedFailure?: (error: unknown) => void;
  }): TransactionState {
    let resolveReady!: () => void;
    let rejectReady!: (error: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    void ready.catch(() => {});
    return {
      pending: [],
      ready,
      resolveReady,
      rejectReady,
      onUnhandedFailure: runOptions?.onUnhandedFailure,
      onFullyHanded: runOptions?.onFullyHanded,
      bodyActive: true,
      handoffStarted: false,
      fullyHanded: false,
      hadBackpressure: false,
      failureReported: false,
      fullyHandedReported: false,
      failed: false,
      failure: undefined,
    };
  }

  function reportUnhandedFailure(current: TransactionState, error: unknown): void {
    if (current.failureReported || current.fullyHanded) return;
    current.failureReported = true;
    current.onUnhandedFailure?.(error);
  }

  function detachWaitListeners(): ListenerCleanupResult {
    const remove = removeWaitListeners;
    removeWaitListeners = null;
    return remove?.() ?? { failed: false };
  }

  function finish(current: TransactionState): void {
    if (transaction !== current) return;
    const cleanup = detachWaitListeners();
    transaction = null;
    state = "idle";
    if (cleanup.failed) {
      current.rejectReady(cleanup.error);
      options?.onDeferredError?.(cleanup.error);
    } else {
      current.resolveReady();
    }
  }

  function fail(current: TransactionState, error: unknown, deferred: boolean): void {
    if (transaction !== current) return;
    detachWaitListeners();
    current.pending.length = 0;
    current.failed = true;
    current.failure = error;
    let failure = error;
    try {
      reportUnhandedFailure(current, error);
    } catch (settlementError) {
      failure = settlementError;
      current.failure = settlementError;
    }
    transaction = null;
    state = "idle";
    current.rejectReady(failure);
    if (deferred) options?.onDeferredError?.(failure);
  }

  function callWrite(write: PendingWrite): boolean {
    const settleTrackedWrite = options?.trackWrite?.(write.stream);
    let settled = false;
    const complete = (error?: Error | null): void => {
      if (settled) return;
      settled = true;
      settleTrackedWrite?.(error);
      write.callback?.();
    };
    let writable: boolean;
    try {
      writable =
        write.callback || settleTrackedWrite
          ? write.stream.write(write.data, complete)
          : write.stream.write(write.data);
    } catch (error) {
      if (!settled) {
        settled = true;
        settleTrackedWrite?.(error);
      }
      throw error;
    }
    write.onHandoff?.();
    return writable;
  }

  function reportFullyHanded(current: TransactionState): void {
    if (current.fullyHandedReported) return;
    current.fullyHandedReported = true;
    current.onFullyHanded?.();
  }

  function waitForDrain(current: TransactionState, stream: NodeJS.WriteStream): void {
    const releases: (() => void)[] = [];
    let active = true;
    const cleanup = (): ListenerCleanupResult => {
      if (!active) return { failed: false };
      active = false;
      let failed = false;
      let firstError: unknown;
      const runCleanup = (operation: () => void): void => {
        try {
          operation();
        } catch (error) {
          if (!failed) {
            failed = true;
            firstError = error;
          }
        }
      };
      runCleanup(() => stream.off("drain", onDrain));
      runCleanup(() => stream.off("close", onClose));
      runCleanup(() => stream.off("finish", onFinish));
      runCleanup(() => stream.off("error", onError));
      for (const release of releases) runCleanup(release);
      return failed ? { failed: true, error: firstError } : { failed: false };
    };
    const onDrain = () => {
      if (!active || transaction !== current) return;
      const listenerCleanup = cleanup();
      removeWaitListeners = null;
      if (listenerCleanup.failed) {
        fail(current, listenerCleanup.error, true);
        return;
      }
      pump(current);
    };
    const onClose = () => {
      if (!active || transaction !== current) return;
      cleanup();
      removeWaitListeners = null;
      fail(current, new Error("Output stream closed before drain."), true);
    };
    const onFinish = () => {
      if (!active || transaction !== current) return;
      cleanup();
      removeWaitListeners = null;
      fail(current, new Error("Output stream ended before drain."), true);
    };
    const onError = (error: unknown) => {
      if (!active || transaction !== current) return;
      cleanup();
      removeWaitListeners = null;
      fail(current, error, true);
    };
    stream.once("drain", onDrain);
    releases.push(acquireRuntimeResource("streamListeners"));
    stream.once("close", onClose);
    releases.push(acquireRuntimeResource("streamListeners"));
    stream.once("finish", onFinish);
    releases.push(acquireRuntimeResource("streamListeners"));
    stream.once("error", onError);
    releases.push(acquireRuntimeResource("streamListeners"));
    removeWaitListeners = cleanup;
  }

  function pump(current: TransactionState): boolean {
    if (transaction !== current) return false;
    try {
      while (current.pending.length > 0) {
        const write = current.pending.shift()!;
        const writable = callWrite(write);
        if (transaction !== current) return false;
        if (!writable) {
          current.hadBackpressure = true;
          state = "backpressured";
          current.fullyHanded = current.pending.length === 0;
          if (current.fullyHanded) reportFullyHanded(current);
          waitForDrain(current, write.stream);
          return current.fullyHanded;
        }
      }
    } catch (error) {
      const deferred = !current.bodyActive;
      fail(current, error, deferred);
      if (!deferred) throw error;
      return false;
    }
    current.fullyHanded = true;
    reportFullyHanded(current);
    if (!current.bodyActive) finish(current);
    return true;
  }

  function handoff(): boolean {
    const current = transaction;
    if (state !== "building" || !current || current.handoffStarted) {
      throw new Error("OutputCoordinator.handoff() requires one unhanded transaction.");
    }
    current.handoffStarted = true;
    return pump(current);
  }

  function capture(
    stream: NodeJS.WriteStream,
    data: string,
    callback?: () => void,
    onHandoff?: () => void,
  ): boolean {
    const current = transaction;
    if (state !== "building" || !current || current.handoffStarted) {
      throw new Error("OutputCoordinator.write() requires the current unhanded transaction.");
    }
    const previous = current.pending.at(-1);
    if (
      previous &&
      previous.stream === stream &&
      previous.callback === undefined &&
      callback === undefined &&
      previous.onHandoff === undefined
    ) {
      previous.data += data;
      previous.onHandoff = onHandoff;
    } else {
      current.pending.push({ stream, data, callback, onHandoff });
    }
    // Capture itself never means backpressure. Runtime helpers use the boolean
    // only for Writable compatibility while the transaction owns handoff.
    return true;
  }

  function blockedResult(): CoordinatedWriteResult {
    const current = transaction;
    if (!current) throw new Error("Output gate is busy without a transaction.");
    return Object.freeze({ status: "blocked", ready: current.ready });
  }

  function run(
    body: () => void,
    runOptions?: {
      readonly onFullyHanded?: () => void;
      readonly onUnhandedFailure?: (error: unknown) => void;
    },
  ): CoordinatedWriteResult {
    if (state !== "idle") return blockedResult();
    const current = newTransaction(runOptions);
    transaction = current;
    state = "building";
    try {
      body();
      if (!current.handoffStarted) handoff();
      if (current.failed) throw current.failure;
    } catch (error) {
      current.bodyActive = false;
      if (transaction === current) {
        if (current.fullyHanded) {
          if (state === "building") finish(current);
        } else if (state === "building") {
          fail(current, error, false);
        }
      }
      throw error;
    }
    current.bodyActive = false;

    if (state === "building") finish(current);
    return current.hadBackpressure
      ? Object.freeze({ status: "accepted", writable: false, ready: current.ready })
      : acceptedWritable;
  }

  function continueTransaction(body: () => void): CoordinatedWriteResult {
    const current = transaction;
    if (state === "building" && current && !current.handoffStarted) {
      body();
      return acceptedWritable;
    }
    if (state === "idle") return run(body);
    return blockedResult();
  }

  function abort(error: unknown): void {
    const current = transaction;
    if (!current) return;
    fail(current, error, false);
  }

  return {
    isBlocked: () => state !== "idle",
    waitForIdle: () => transaction?.ready ?? Promise.resolve(),
    run,
    continue: continueTransaction,
    write: capture,
    handoff,
    abort,
  };
}
