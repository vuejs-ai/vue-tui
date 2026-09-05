import type { TerminalBackend } from "./backend.ts";

/**
 * Raw mode's shared state for one input.
 *
 * The other five modes are escape sequences on an output this process owns
 * alone, so their ledger lives with the backend that writes them. Raw mode is an
 * ioctl on the input device, and every session mounted on the same stdin
 * switches that one device, so its state is keyed by the input rather than by
 * the backend that borrowed it.
 */
interface RawModeState {
  /** Holders across every session mounted on this input. */
  refs: number;
  // True between a last release (refs→0) and the microtask that actually
  // disables raw mode. A same-tick re-acquire reads this to know raw mode is
  // still physically on, so it can skip re-issuing setRawMode(true)/ref() and
  // cancel the queued disable.
  pendingDisable: boolean;
  baselineRaw: boolean;
  changedRawMode: boolean;
  physicalActive: boolean;
  physicalRawUncertain: boolean;
  physicalRefHeld: boolean;
  physicalRefUncertain: boolean;
  reconciling: boolean;
  reconcileRequested: boolean;
}

const rawModeStates = new WeakMap<object, RawModeState>();

function stateFor(inputOwner: object): RawModeState {
  let state = rawModeStates.get(inputOwner);
  if (!state) {
    state = {
      refs: 0,
      pendingDisable: false,
      baselineRaw: false,
      changedRawMode: false,
      physicalActive: false,
      physicalRawUncertain: false,
      physicalRefHeld: false,
      physicalRefUncertain: false,
      reconciling: false,
      reconcileRequested: false,
    };
    rawModeStates.set(inputOwner, state);
  }
  return state;
}

function reconcilePhysical(terminal: TerminalBackend, state: RawModeState): void {
  if (state.reconciling) {
    state.reconcileRequested = true;
    return;
  }

  state.reconciling = true;
  let firstError: unknown;
  let hasError = false;
  let mustConvergeAfterError = false;
  const retriedTransitions = new Set<"raw-on" | "ref" | "raw-off" | "unref">();

  function recordTransitionError(
    error: unknown,
    transition: "raw-on" | "ref" | "raw-off" | "unref",
    recoverWithoutReentry = false,
  ): boolean {
    if (!hasError) {
      firstError = error;
      hasError = true;
    }
    // A nested acquire/release returned while this host callback was still
    // running. Finish *all* raw + ref transitions required by that surviving
    // owner before surfacing the original error to the outer caller. Each
    // physical operation gets one recovery attempt, so a raw restore and an
    // unref that both fail once can still converge without looping forever on
    // a permanently hostile custom stream.
    const shouldRecover =
      state.reconcileRequested || recoverWithoutReentry || mustConvergeAfterError;
    if (!shouldRecover || retriedTransitions.has(transition)) return false;
    retriedTransitions.add(transition);
    mustConvergeAfterError = true;
    return true;
  }

  try {
    while (true) {
      state.reconcileRequested = false;
      const shouldBeActive = state.refs > 0 || state.pendingDisable;

      if (shouldBeActive) {
        if (!state.physicalActive || state.physicalRawUncertain) {
          // Commit the transition before calling a hostile stream. Re-entrant
          // suspend/release updates the desired counts; the next loop then
          // compensates instead of letting the outer acquisition overwrite it.
          state.physicalActive = true;
          state.physicalRawUncertain = false;
          if (state.changedRawMode) {
            try {
              terminal.setRawMode(true);
            } catch (error) {
              // A throwing custom stream may have failed before or after the
              // ioctl. Mark the state uncertain so the next desired owner
              // retries enable, or the no-owner cleanup explicitly restores
              // the baseline instead of trusting this transition.
              state.physicalActive = false;
              state.physicalRawUncertain = true;
              if (!recordTransitionError(error, "raw-on")) break;
            }
          }
          continue;
        }
        if (!state.physicalRefHeld || state.physicalRefUncertain) {
          state.physicalRefHeld = true;
          state.physicalRefUncertain = false;
          try {
            terminal.refInput();
          } catch (error) {
            state.physicalRefHeld = false;
            state.physicalRefUncertain = true;
            if (!recordTransitionError(error, "ref")) break;
          }
          continue;
        }
      } else {
        if (state.physicalActive || state.physicalRawUncertain) {
          state.physicalActive = false;
          state.physicalRawUncertain = false;
          if (state.changedRawMode) {
            try {
              terminal.setRawMode(state.baselineRaw);
            } catch (error) {
              // A failed release may have left the terminal raw. Retain the
              // ownership fact so teardown can retry instead of assuming the
              // terminal is already restored.
              state.physicalRawUncertain = true;
              // Restoring cooked mode is idempotent. A one-shot host failure
              // during suspension/unmount must not leave the shell raw after
              // the framework has dropped its input listener.
              if (!recordTransitionError(error, "raw-off", true)) break;
            }
          }
          continue;
        }
        if (state.physicalRefHeld || state.physicalRefUncertain) {
          state.physicalRefHeld = false;
          state.physicalRefUncertain = false;
          try {
            terminal.unrefInput();
          } catch (error) {
            state.physicalRefUncertain = true;
            // Node's unref() is idempotent. Retry a failed final release once
            // so a transient custom-stream error cannot keep the process
            // alive after the controller is disposed.
            if (!recordTransitionError(error, "unref", true)) break;
          }
          continue;
        }
      }

      if (!state.reconcileRequested) break;
    }
  } finally {
    state.reconciling = false;
  }
  if (hasError) throw firstError;
}

function resetIfIdle(state: RawModeState): void {
  if (
    state.refs === 0 &&
    !state.pendingDisable &&
    !state.physicalActive &&
    !state.physicalRawUncertain &&
    !state.physicalRefHeld &&
    !state.physicalRefUncertain &&
    !state.reconciling
  ) {
    state.pendingDisable = false;
    state.baselineRaw = false;
    state.changedRawMode = false;
    state.reconcileRequested = false;
  }
}

/** One backend's share of the input's raw-mode state. */
export interface RawModeDevice {
  /**
   * Match the input to the holders this backend's ledger counts. `defer` lets a
   * same-tick replacement inherit an already-raw input instead of switching it
   * twice; a suspension, a teardown or a failed acquisition asks for the
   * transition now, and cancels a deferral another release queued.
   */
  reconcile(holders: number, options: { readonly defer: boolean }): void;
  /** Whether Runtime currently holds this input in raw mode. */
  readonly isEnabled: boolean;
}

export function createRawModeDevice(
  terminal: TerminalBackend,
  reportDeferredFailure: (error: unknown) => void,
): RawModeDevice {
  const state = stateFor(terminal.inputOwner);
  let contributed = 0;

  return {
    reconcile(holders, options) {
      const previous = contributed;
      if (holders === previous && options.defer) return;
      contributed = holders;

      if (holders > previous) {
        if (
          state.refs === 0 &&
          !state.pendingDisable &&
          !state.physicalActive &&
          !state.physicalRawUncertain &&
          !state.physicalRefHeld &&
          !state.physicalRefUncertain
        ) {
          state.baselineRaw = terminal.isRawModeEnabled;
          state.changedRawMode = !state.baselineRaw;
        }
        state.refs += holders - previous;
        state.pendingDisable = false;
        reconcilePhysical(terminal, state);
        return;
      }

      state.refs = Math.max(0, state.refs - (previous - holders));
      const holdsDevice =
        state.physicalActive ||
        state.physicalRawUncertain ||
        state.physicalRefHeld ||
        state.physicalRefUncertain;
      if (options.defer && state.refs === 0 && holdsDevice) {
        // Defer only the shared physical toggle, allowing a same-tick
        // replacement hook or managed route to inherit the already-active
        // terminal state.
        state.pendingDisable = true;
        queueMicrotask(() => {
          if (!state.pendingDisable || state.refs > 0) return;
          state.pendingDisable = false;
          try {
            reconcilePhysical(terminal, state);
          } catch (error) {
            // The deferred restore has no caller left to raise to.
            reportDeferredFailure(error);
          } finally {
            resetIfIdle(state);
          }
        });
        return;
      }
      if (!options.defer) {
        // Clearing pendingDisable also cancels a queued microtask so it cannot
        // double-unref, and covers the teardown ordering where Vue's cleanup
        // already released the last ref: on the signal-exit path that microtask
        // never runs, so the input would be left raw.
        state.pendingDisable = false;
        try {
          reconcilePhysical(terminal, state);
        } finally {
          resetIfIdle(state);
        }
        return;
      }
      resetIfIdle(state);
    },
    get isEnabled() {
      return state.physicalActive;
    },
  };
}
