import process from "node:process";

export type ProcessSuspensionSignal = "SIGTSTP" | "SIGCONT";

export interface SuspensionHooks {
  /** Temporarily release every terminal resource owned by this session. */
  readonly suspend: () => void;
  /** Reacquire the same effective surface and repaint it after continuation. */
  readonly resume: () => void | Promise<void>;
}

type SuspensionSignalListener = () => void | Promise<void>;

/** Injectable process boundary. Tests use this without stopping the test runner. */
export interface ProcessSuspensionAdapter {
  readonly platform: NodeJS.Platform;
  readonly addSignalListener: (
    signal: ProcessSuspensionSignal,
    listener: SuspensionSignalListener,
  ) => void;
  readonly removeSignalListener: (
    signal: ProcessSuspensionSignal,
    listener: SuspensionSignalListener,
  ) => void;
  /**
   * Stop the current process with SIGSTOP. `afterContinue` must run only after the process has
   * continued. A real self-directed SIGSTOP blocks this call until an external SIGCONT arrives.
   */
  readonly stopCurrentProcess: (afterContinue: () => void) => void;
}

/** The rendering lifecycle depends on this small boundary rather than process signals directly. */
export interface SuspensionHost {
  readonly supported: boolean;
  readonly register: (hooks: SuspensionHooks) => () => void;
}

/** Deterministic test host: callers choose exactly when suspension and continuation occur. */
export interface ManualSuspensionHost extends SuspensionHost {
  readonly suspend: () => Promise<void>;
  readonly resume: () => Promise<void>;
}

/** Internal mount-option key used by deterministic hosts to replace OS signals. */
export const INTERNAL_SUSPENSION_HOST: unique symbol = Symbol.for(
  "@vue-tui/runtime:internal-suspension-host",
);

interface Registration {
  readonly hooks: SuspensionHooks;
  active: boolean;
}

interface SuspensionCycle {
  readonly registrations: readonly Registration[];
}

const defaultAdapter: ProcessSuspensionAdapter = {
  platform: process.platform,
  addSignalListener(signal, listener) {
    process.on(signal, listener);
  },
  removeSignalListener(signal, listener) {
    process.off(signal, listener);
  },
  stopCurrentProcess(afterContinue) {
    // Re-sending SIGTSTP can be ignored for an orphaned process group. SIGSTOP cannot be caught,
    // blocked, or ignored, so it reliably performs the stop after every session has restored its
    // terminal state. For a signal directed at this process, this call returns after SIGCONT.
    process.kill(process.pid, "SIGSTOP");
    afterContinue();
  },
};

function runBestEffort(callback: () => void): void {
  try {
    callback();
  } catch {
    // Signal handling must continue through every registered session. A failed session cleanup
    // must not leave later sessions holding raw mode, mouse reporting, or the alternate screen.
  }
}

/**
 * Coordinate process-wide job-control signals across any number of mounted terminal sessions.
 *
 * Listeners are installed lazily for the first registration and removed after the last one.
 * Windows does not implement POSIX job control, so registration there is an intentional no-op.
 */
export function createProcessSuspensionHost(
  adapter: ProcessSuspensionAdapter = defaultAdapter,
): SuspensionHost {
  const registrations = new Set<Registration>();
  const supported = adapter.platform !== "win32";
  let listenersAttached = false;
  let detachWhenIdle = false;
  let phase: "idle" | "suspending" | "suspended" | "resuming" = "idle";
  let activeCycle: SuspensionCycle | undefined;

  const finishResumeCycle = (): void => {
    if (phase === "resuming") phase = "idle";
    if (detachWhenIdle && registrations.size === 0) detachListeners();
  };

  const resumeCycle = (expectedCycle?: SuspensionCycle): void | Promise<void> => {
    const cycle = activeCycle;
    if (
      phase !== "suspended" ||
      cycle === undefined ||
      (expectedCycle !== undefined && expectedCycle !== cycle)
    ) {
      return;
    }

    // Stay non-idle until every session has resumed. This ignores duplicate SIGCONT and prevents
    // a hook from starting a nested stop cycle before later sessions have reacquired their state.
    phase = "resuming";
    activeCycle = undefined;
    const pending: Promise<void>[] = [];
    for (const registration of cycle.registrations) {
      if (!registration.active) continue;
      try {
        const result = registration.hooks.resume();
        if (result) pending.push(Promise.resolve(result));
      } catch {
        // A failed session resume must not prevent later sessions from
        // reacquiring their terminal state.
      }
    }
    if (pending.length === 0) {
      finishResumeCycle();
      return;
    }
    return Promise.allSettled(pending).then(() => finishResumeCycle());
  };

  const handleContinue = (): void | Promise<void> => resumeCycle();

  const handleSuspend = (): void => {
    if (phase !== "idle" || registrations.size === 0) return;

    phase = "suspending";
    const cycle: SuspensionCycle = { registrations: [...registrations] };
    activeCycle = cycle;
    for (const registration of cycle.registrations) {
      if (registration.active) runBestEffort(registration.hooks.suspend);
    }

    phase = "suspended";
    try {
      adapter.stopCurrentProcess(() => resumeCycle(cycle));
    } catch {
      // If SIGSTOP could not be delivered, put successful suspension hooks back into a usable
      // state immediately instead of waiting forever for a SIGCONT that will never arrive.
      void resumeCycle(cycle);
    }
  };

  const attachListeners = (): void => {
    if (listenersAttached) return;

    adapter.addSignalListener("SIGTSTP", handleSuspend);
    try {
      adapter.addSignalListener("SIGCONT", handleContinue);
    } catch (error) {
      runBestEffort(() => adapter.removeSignalListener("SIGTSTP", handleSuspend));
      throw error;
    }
    listenersAttached = true;
  };

  const detachListeners = (): void => {
    if (!listenersAttached) return;
    if (phase !== "idle") {
      // Keep SIGCONT observable until an in-flight stop cycle completes, even if its last session
      // unmounted from a hook. The external SIGTSTP must still stop the process exactly once.
      detachWhenIdle = true;
      return;
    }

    listenersAttached = false;
    detachWhenIdle = false;
    runBestEffort(() => adapter.removeSignalListener("SIGTSTP", handleSuspend));
    runBestEffort(() => adapter.removeSignalListener("SIGCONT", handleContinue));
    activeCycle = undefined;
  };

  return {
    supported,
    register(hooks) {
      if (!supported) return () => {};

      const registration: Registration = { hooks, active: true };
      detachWhenIdle = false;
      registrations.add(registration);
      try {
        attachListeners();
      } catch (error) {
        registration.active = false;
        registrations.delete(registration);
        throw error;
      }

      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        registration.active = false;
        registrations.delete(registration);
        if (registrations.size === 0) detachListeners();
      };
    },
  };
}

/**
 * Create a suspension host that never sends operating-system signals.
 *
 * Runtime tests can inject this host and call suspend()/resume() around assertions. Its hook
 * ordering, reentry guards, and unregister behavior are the same as the production host.
 */
export function createManualSuspensionHost(
  options: { readonly supported?: boolean } = {},
): ManualSuspensionHost {
  const listeners = new Map<ProcessSuspensionSignal, Set<SuspensionSignalListener>>();
  const emit = async (signal: ProcessSuspensionSignal): Promise<void> => {
    const pending: Promise<void>[] = [];
    for (const listener of listeners.get(signal) ?? []) {
      try {
        const result = listener();
        if (result) pending.push(Promise.resolve(result));
      } catch {
        // Match process signal delivery: one listener cannot prevent the rest.
      }
    }
    await Promise.allSettled(pending);
  };
  const host = createProcessSuspensionHost({
    platform: options.supported === false ? "win32" : "linux",
    addSignalListener(signal, listener) {
      let signalListeners = listeners.get(signal);
      if (!signalListeners) {
        signalListeners = new Set();
        listeners.set(signal, signalListeners);
      }
      signalListeners.add(listener);
    },
    removeSignalListener(signal, listener) {
      listeners.get(signal)?.delete(listener);
    },
    // The manual caller delivers continuation separately through resume().
    stopCurrentProcess() {},
  });

  return {
    supported: host.supported,
    register: host.register,
    suspend: () => emit("SIGTSTP"),
    resume: () => emit("SIGCONT"),
  };
}

/** Production singleton used when a mount does not inject another SuspensionHost. */
export const processSuspensionHost: SuspensionHost = createProcessSuspensionHost();
