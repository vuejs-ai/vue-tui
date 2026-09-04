import type {
  TerminalBackend,
  TerminalLease,
  TerminalMode,
  TerminalModeReleaseOptions,
  TerminalModeWrite,
} from "./backend.ts";
import { createRawModeDevice, type RawModeDevice } from "./raw-mode.ts";

/**
 * What one terminal-wide mode costs the device, and what the device will take.
 *
 * Every mode below is one reference-counted protocol: the mode goes on when the
 * first holder arrives and comes back off when the last one leaves. The rows
 * differ only where the six modes genuinely differ, so the differences are
 * visible side by side instead of living at six operating sites.
 */
interface EscapeModePolicy {
  /** A mode the backend switches by writing to the output. */
  readonly kind: "escape";
  /** Bytes that put the device into this mode. */
  readonly enable: string;
  /** Bytes that take it back out. */
  readonly restore: string;
  /** Whether the enable bytes may reach the current device. */
  canEnable(terminal: TerminalBackend): boolean;
  /** Whether the restore bytes may reach it, asked separately for the sync path. */
  canRestore(terminal: TerminalBackend, sync: boolean): boolean;
  /**
   * Whether a write that reached `stream.write()` without confirming leaves the
   * mode possibly applied. Synchronized output is the exception: its markers are
   * written without an attempt hook, so an unconfirmed BSU closes nothing.
   */
  readonly tracksUncertainty: boolean;
  /**
   * Whether an abrupt restore re-sends the restore bytes for a mode that has
   * been applied at least once, even when the device already reads as restored.
   * A non-returning exit cannot rely on an earlier asynchronous restore having
   * flushed, and re-disabling a disabled mode is a terminal no-op.
   */
  readonly reissueOnAbruptRestore: boolean;
  /**
   * Whether a captured write holds the opposite transition until it hands off.
   * A mode whose demand settles asynchronously must not flip the device twice
   * inside one transaction; synchronized output is the exception, because it is
   * a bracket whose end marker always follows its begin marker in the same one.
   */
  readonly deferWhilePending: boolean;
}

/**
 * A mode the backend switches by operating the device itself. Raw mode is the
 * only one: it is a line discipline rather than a sequence, and the input it
 * switches is shared by every session mounted on the same stdin, so its state is
 * process-wide instead of living with one backend.
 */
interface DeviceModePolicy {
  readonly kind: "device";
  create(terminal: TerminalBackend, reportDeferredFailure: (error: unknown) => void): RawModeDevice;
}

type ModePolicy = EscapeModePolicy | DeviceModePolicy;

/** Begin and end synchronized update, the one mode whose markers are named. */
export const bsu = "\x1b[?2026h";
export const esu = "\x1b[?2026l";

const canWriteOutput = (terminal: TerminalBackend): boolean =>
  terminal.capabilities.stdout.canWrite;

const isLiveTty = (terminal: TerminalBackend): boolean =>
  terminal.capabilities.stdout.isTTY && terminal.capabilities.stdout.canWrite;

const modePolicies: Readonly<Record<TerminalMode, ModePolicy>> = {
  "alternate-screen": {
    kind: "escape",
    // Home follows the switch so the viewport has a stable origin before its
    // first frame; the two have always travelled as one write.
    enable: "\x1b[?1049h\x1b[H",
    restore: "\x1b[?1049l",
    // The alternate screen is only ever requested for a resolved Fullscreen
    // surface, which preflight already proved is a live TTY. Let the stream
    // report its own failure rather than silently skipping the switch.
    canEnable: () => true,
    canRestore: canWriteOutput,
    tracksUncertainty: true,
    reissueOnAbruptRestore: false,
    deferWhilePending: true,
  },
  "cursor-visibility": {
    kind: "escape",
    enable: "\x1b[?25l",
    restore: "\x1b[?25h",
    canEnable: isLiveTty,
    canRestore: canWriteOutput,
    tracksUncertainty: true,
    reissueOnAbruptRestore: false,
    deferWhilePending: true,
  },
  "synchronized-output": {
    kind: "escape",
    enable: bsu,
    restore: esu,
    canEnable: (terminal) => terminal.capabilities.stdout.isTTY,
    canRestore: (terminal) => terminal.capabilities.stdout.isTTY,
    tracksUncertainty: false,
    reissueOnAbruptRestore: false,
    deferWhilePending: false,
  },
  "bracketed-paste": {
    kind: "escape",
    enable: "\x1b[?2004h",
    restore: "\x1b[?2004l",
    canEnable: isLiveTty,
    canRestore: (terminal) => isLiveTty(terminal),
    tracksUncertainty: true,
    reissueOnAbruptRestore: true,
    deferWhilePending: true,
  },
  "kitty-keyboard": {
    kind: "escape",
    // Fixed progressive-enhancement level: only disambiguate escape codes.
    enable: "\x1b[>1u",
    restore: "\x1b[<u",
    // Enabling needs a readable stdin, because the terminal answers the support
    // query there.
    canEnable: (terminal) =>
      terminal.capabilities.stdin.isTTY &&
      terminal.capabilities.stdin.canRead &&
      terminal.capabilities.stdout.isTTY &&
      terminal.capabilities.stdout.canWrite,
    // Restoring does not: the pop only travels outward, and a stdin that has
    // gone away is exactly when leaving the protocol pushed costs the user
    // their shell. The synchronous pop skips the capability gate entirely,
    // because it runs on the signal path and on the emergency restore, where
    // the stream's own flags are least reliable.
    canRestore: (terminal, sync) => sync || canWriteOutput(terminal),
    tracksUncertainty: true,
    reissueOnAbruptRestore: false,
    deferWhilePending: true,
  },
  raw: {
    kind: "device",
    create: createRawModeDevice,
  },
};

/**
 * The order the sweep restores modes in when an owner left one behind. It is the
 * order teardown itself uses: the input protocols, then the screen the viewport
 * borrowed, then the cursor it hid, then the paste framing, then the input's own
 * line discipline.
 */
const restoreOrder: readonly TerminalMode[] = [
  "synchronized-output",
  "kitty-keyboard",
  "alternate-screen",
  "cursor-visibility",
  "bracketed-paste",
  "raw",
];

interface PendingModeWrite {
  readonly target: boolean;
  attempted: boolean;
}

interface ModeState {
  readonly mode: TerminalMode;
  readonly policy: ModePolicy;
  /** Present exactly for a mode the backend operates rather than writes. */
  readonly device: RawModeDevice | undefined;
  holders: number;
  /** Release callbacks for the leases still able to give this mode back. */
  readonly leases: Set<() => void>;
  /** The device is known to carry the mode. */
  active: boolean;
  /** A write reached the stream without confirming; the mode may be applied. */
  uncertain: boolean;
  /** Captured writes the output gate has not yet handed to the device, in order. */
  readonly pending: PendingModeWrite[];
  /** Whether the mode has been applied to this device at least once. */
  everApplied: boolean;
  /** A synchronous restore is owed once the captured writes have handed off. */
  deferredSyncRestore: boolean;
  reconciling: boolean;
}

/**
 * Reference-counted mode ownership for one device.
 *
 * The count a test observes is the count production keeps, and the bytes are
 * issued here: `acquire` writes a mode's enable sequence when its first holder
 * arrives, `release` writes the restore sequence when its last one leaves.
 */
export interface TerminalModeLeases {
  acquire<Mode extends TerminalMode>(mode: Mode): TerminalLease<Mode>;
  isHeld(mode: TerminalMode): boolean;
  isActive(mode: TerminalMode): boolean;
  isSettled(mode: TerminalMode): boolean;
  attachWrites(write: TerminalModeWrite | null): void;
  abandonPendingOutput(options?: { readonly physicalStateUncertain?: boolean }): void;
  reconcile(): void;
  restore(mode: TerminalMode, options?: TerminalModeReleaseOptions): void;
  restoreAll(options?: TerminalModeReleaseOptions): void;
  onChange(listener: ((mode: TerminalMode) => void) | null): void;
  onFailure(listener: ((error: unknown) => void) | null): void;
}

export function createTerminalModeLeases(terminal: TerminalBackend): TerminalModeLeases {
  const states = new Map<TerminalMode, ModeState>();
  let coordinatedWrite: TerminalModeWrite | null = null;
  let changeListener: ((mode: TerminalMode) => void) | null = null;
  let failureListener: ((error: unknown) => void) | null = null;

  function stateFor(mode: TerminalMode): ModeState {
    let state = states.get(mode);
    if (!state) {
      const policy = modePolicies[mode];
      state = {
        mode,
        policy,
        device:
          policy.kind === "device"
            ? policy.create(terminal, (error) => failureListener?.(error))
            : undefined,
        holders: 0,
        leases: new Set(),
        active: false,
        uncertain: false,
        pending: [],
        everApplied: false,
        deferredSyncRestore: false,
        reconciling: false,
      };
      states.set(mode, state);
    }
    return state;
  }

  function notify(mode: TerminalMode): void {
    changeListener?.(mode);
  }

  function commit(state: ModeState, target: boolean): void {
    state.active = target;
    state.uncertain = false;
    if (target) state.everApplied = true;
  }

  /** The state the device reaches once every captured write has been handed off. */
  function settledState(state: ModeState): boolean {
    return state.pending.at(-1)?.target ?? state.active;
  }

  /** Drop captured writes whose transaction will never hand them off. */
  function abandon(state: ModeState): void {
    let attempted = false;
    for (const pending of state.pending.splice(0)) attempted ||= pending.attempted;
    if (attempted && state.policy.kind === "escape" && state.policy.tracksUncertainty) {
      state.uncertain = true;
    }
  }

  /**
   * Match the device to this mode's holders. A written mode converges through
   * the loop below; an operated one hands the count to its device, where `sync`
   * means the transition happens now rather than at the microtask boundary that
   * lets a same-tick replacement inherit it.
   */
  function applyMode(state: ModeState, sync: boolean): void {
    if (state.device) {
      // Raw mode changes with every input consumer and no reconciler waits on
      // it, so it is not reported the way a written mode is.
      state.device.reconcile(state.holders, { defer: !sync });
      return;
    }
    reconcile(state, sync);
  }

  /**
   * Issue one mode transition. Returns false when nothing was written, either
   * because the device cannot take these bytes or because the output gate is
   * owned by a transaction that already began handing off.
   */
  function writeTransition(state: ModeState, target: boolean, sync: boolean): boolean {
    const policy = state.policy;
    if (policy.kind !== "escape") return false;
    if (target ? !policy.canEnable(terminal) : !policy.canRestore(terminal, sync)) return false;
    const data = target ? policy.enable : policy.restore;

    if (sync) {
      try {
        terminal.writeSync("stdout", data);
      } catch (error) {
        if (policy.tracksUncertainty) state.uncertain = true;
        throw error;
      }
      commit(state, target);
      notify(state.mode);
      return true;
    }

    const pending: PendingModeWrite = { target, attempted: false };
    state.pending.push(pending);
    let accepted: boolean;
    const write =
      coordinatedWrite ??
      // Before a session attaches its output gate, and after it detaches, a mode
      // write goes straight to the stream and is handed off by definition.
      ((bytes: string, onHandoff?: () => void, onAttempt?: () => void): boolean => {
        onAttempt?.();
        terminal.write("stdout", bytes);
        onHandoff?.();
        return true;
      });
    try {
      accepted = write(
        data,
        () => {
          const index = state.pending.indexOf(pending);
          if (index === -1) return;
          state.pending.splice(index, 1);
          commit(state, target);
          notify(state.mode);
          reconcile(state, false);
        },
        // A mode that records no uncertainty asks for no attempt hook, which
        // also lets the gate keep combining its marker with the segment before.
        policy.tracksUncertainty
          ? () => {
              pending.attempted = true;
            }
          : undefined,
      );
    } catch (error) {
      const index = state.pending.indexOf(pending);
      if (index !== -1) {
        state.pending.splice(index, 1);
        if (pending.attempted && policy.tracksUncertainty) state.uncertain = true;
      }
      throw error;
    }
    const index = state.pending.indexOf(pending);
    if (!accepted && index !== -1) {
      state.pending.splice(index, 1);
      notify(state.mode);
      return false;
    }
    return true;
  }

  function reconcile(state: ModeState, sync: boolean): void {
    const policy = state.policy;
    if (policy.kind !== "escape") return;
    if (state.reconciling) {
      // The loop below re-reads the holders after every write, so a re-entrant
      // change is picked up there; only a synchronous restore has to survive.
      state.deferredSyncRestore ||= sync;
      return;
    }
    state.reconciling = true;
    let effectiveSync = sync || state.deferredSyncRestore;
    state.deferredSyncRestore = false;
    try {
      for (;;) {
        if (state.pending.length > 0 && policy.deferWhilePending) {
          // A synchronous restore requested while a write is captured has to
          // wait: only that write's handoff decides whether this device owns
          // anything to restore.
          state.deferredSyncRestore ||= effectiveSync;
          break;
        }
        // Converge to a known-restored device before honouring a new demand: an
        // unconfirmed write may or may not have reached the terminal, so the
        // only state both branches agree on is "restored".
        const target = state.uncertain ? false : state.holders > 0;
        if (!state.uncertain && target === settledState(state)) break;
        const before = state.pending.length;
        // Only a restore is ever owed synchronously; a signal path never enables.
        if (!writeTransition(state, target, target ? false : effectiveSync)) break;
        effectiveSync = state.deferredSyncRestore || effectiveSync;
        if (state.pending.length > before) break;
      }
    } finally {
      state.reconciling = false;
    }
  }

  function forget(state: ModeState): void {
    for (const deactivate of Array.from(state.leases)) deactivate();
    state.leases.clear();
    state.holders = 0;
  }

  function restore(mode: TerminalMode, sync: boolean, reissue: boolean): void {
    const state = stateFor(mode);
    forget(state);
    const policy = state.policy;
    if (policy.kind === "device") {
      // A sweep is the last restore anyone will ask for, so an operated mode
      // transitions now whichever path reached here.
      state.device?.reconcile(0, { defer: false });
      return;
    }
    const mustReissue =
      reissue &&
      sync &&
      policy.reissueOnAbruptRestore &&
      state.everApplied &&
      state.pending.length === 0;
    if (mustReissue) {
      // Re-send unconditionally: Vue's cleanup may already have written the
      // asynchronous restore that a re-raised signal is about to drop, and
      // restoring an already-restored mode is a terminal no-op.
      state.active = true;
    }
    reconcile(state, sync);
  }

  function isHeld(mode: TerminalMode): boolean {
    return stateFor(mode).holders > 0;
  }

  function isActive(mode: TerminalMode): boolean {
    const state = stateFor(mode);
    if (state.device) return state.device.isEnabled;
    return state.active && !state.uncertain;
  }

  function isSettled(mode: TerminalMode): boolean {
    const state = stateFor(mode);
    if (state.device) return state.device.isEnabled === state.holders > 0;
    // Nothing left to do: what the device will carry once every captured write
    // hands off is already what the holders ask for.
    return !state.uncertain && settledState(state) === state.holders > 0;
  }

  return {
    acquire<Mode extends TerminalMode>(mode: Mode): TerminalLease<Mode> {
      const state = stateFor(mode);
      state.holders++;
      let active = true;
      const deactivate = (): void => {
        active = false;
        state.leases.delete(deactivate);
      };
      state.leases.add(deactivate);
      const lease: TerminalLease<Mode> = Object.freeze({
        mode,
        reassert() {
          if (!active || state.policy.kind !== "escape") return;
          if (!state.policy.canEnable(terminal)) return;
          // Re-issued without a handoff hook: ownership does not change, so the
          // bytes only restate what this lease already holds. A Fullscreen frame
          // and a fresh Inline region each restate the hidden cursor at the head
          // of their own output.
          if (coordinatedWrite) coordinatedWrite(state.policy.enable);
          else terminal.write("stdout", state.policy.enable);
        },
        release(options?: TerminalModeReleaseOptions) {
          if (!active) return;
          deactivate();
          state.holders = Math.max(0, state.holders - 1);
          const sync = options?.sync === true;
          try {
            applyMode(state, sync);
          } catch (error) {
            // A stream can accept the restore and then throw while this
            // reconciler is still on the stack. Retry the idempotent transition
            // once it has unwound, then preserve the original failure. An
            // operated mode runs its own bounded recovery and is not asked twice.
            if (!state.device) {
              try {
                applyMode(state, sync);
              } catch {
                // Preserve the first release failure.
              }
            }
            throw error;
          }
        },
      });
      try {
        applyMode(state, false);
      } catch (error) {
        // The acquisition never completed, so it owns no share of the mode.
        // Give the share back and let the surviving demand converge. An operated
        // mode gives it back now: its caller reads the device as soon as the
        // failure returns, with no transaction left to hand off first.
        try {
          lease.release({ sync: state.device !== undefined });
        } catch {
          // Preserve the acquisition failure.
        }
        throw error;
      }
      return lease;
    },
    isHeld,
    isActive,
    isSettled,
    attachWrites(write) {
      coordinatedWrite = write;
    },
    abandonPendingOutput(options) {
      for (const state of states.values()) abandon(state);
      if (options?.physicalStateUncertain !== true) return;
      // The gate is idle before it reports a physical failure. Converge every
      // mode whose device state is no longer known.
      for (const state of states.values()) {
        if (state.uncertain) reconcile(state, false);
      }
    },
    reconcile() {
      for (const state of states.values()) applyMode(state, false);
    },
    restore(mode, options) {
      restore(mode, options?.sync === true, true);
    },
    restoreAll(options) {
      for (const mode of restoreOrder) {
        // The ledger decides: a mode nobody holds, that the device does not
        // carry and that has nothing outstanding, owes the terminal nothing.
        if (!isHeld(mode) && !isActive(mode) && isSettled(mode)) continue;
        try {
          // Each mode stands alone: one that refuses its restore must not cost
          // the terminal the screen or the cursor another one still owns. The
          // owner that failed has already reported the failure.
          restore(mode, options?.sync === true, false);
        } catch {
          // Continue the sweep.
        }
      }
    },
    onChange(listener) {
      changeListener = listener;
    },
    onFailure(listener) {
      failureListener = listener;
    },
  };
}
