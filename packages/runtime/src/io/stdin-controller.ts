import { writeSync as fsWriteSync } from "node:fs";
import type { AppContext, StdinContext } from "../context.ts";
import {
  getSharedStdinIngress,
  type SharedStdinIngress,
  type SharedStdinSubscription,
} from "./stdin-ingress.ts";
import type { InputEvent } from "./normalized-input.ts";
import { projectPublicInputEvent } from "./public-input.ts";
import {
  createInputDispatcher,
  type InternalInputDemandLease,
  type InternalInputSubscriber,
} from "./input-subscriptions.ts";
import type { StartKittyQueryResponseDetection } from "./kitty-keyboard.ts";

export function hasRawInputCapability(stdin: NodeJS.ReadStream): boolean {
  const input = stdin as NodeJS.ReadStream & {
    readonly isRaw?: boolean;
    readonly setRawMode?: (mode: boolean) => unknown;
  };
  return input.isRaw === true || typeof input.setRawMode === "function";
}

function isReadableHostLive(stdin: NodeJS.ReadStream): boolean {
  const stream = stdin as NodeJS.ReadStream & {
    readonly readable?: boolean;
    readonly readableEnded?: boolean;
  };
  return !stream.destroyed && !stream.readableEnded && stream.readable !== false;
}

export interface StdinController extends StdinContext {
  // sync writes terminal restores immediately. Abrupt teardown additionally
  // reissues idempotent OFF modes after Vue cleanup because a non-returning
  // process/signal exit cannot rely on an earlier asynchronous write flushing.
  dispose: (sync?: boolean, reissueAbruptTerminalDisables?: boolean) => void;
  /** Temporarily release physical input modes without dropping logical consumers. */
  suspend: (sync?: boolean) => void;
  /** Reacquire the physical input modes still requested by logical consumers. */
  resume: () => void;
  /** Own the Kitty support reply on this controller's single physical stdin ingress. */
  startKittyQueryResponseDetection: StartKittyQueryResponseDetection;
  /** Deliver input retained while Vue installed the application's first route. */
  activateInputDelivery: () => void;
  /** Register desired semantic input without requiring immediate output capacity. */
  acquireSemanticInput: () => InternalInputDemandLease;
  /** Whether Runtime currently depends on this stream for managed input. */
  hasManagedInputDemand: () => boolean;
  /** Reconcile the newest semantic-input and terminal-mode desired state. */
  reconcileTerminalState: () => void;
  /** Forget control writes captured by a transaction that never handed them off. */
  abandonPendingTerminalOutput: (options?: { readonly physicalStateUncertain?: boolean }) => void;
  /** Adjust the private bracketed-paste reference count transactionally. */
  setBracketedPasteMode: (enabled: boolean) => void;
  /** Report independent cleanup failures without stopping later releases. */
  setCleanupErrorSink: (sink: ((error: unknown) => void) | null) => void;
}

interface RawModeState {
  refs: number;
  // True between a last-release (refs→0) and the microtask that actually disables
  // raw mode. A same-tick re-acquire reads this to know raw mode is still
  // physically on, so it can skip re-issuing ref()/setRawMode(true) and cancel the
  // queued disable.
  pendingDisable: boolean;
  baselineRaw: boolean;
  changedRawMode: boolean;
  activeRefs: number;
  physicalActive: boolean;
  physicalRawUncertain: boolean;
  physicalRefHeld: boolean;
  physicalRefUncertain: boolean;
  reconcilingPhysical: boolean;
  physicalReconcileRequested: boolean;
}
const rawModeRegistry = new WeakMap<NodeJS.ReadStream, RawModeState>();

function getRawModeState(stdin: NodeJS.ReadStream): RawModeState {
  let state = rawModeRegistry.get(stdin);
  if (!state) {
    state = {
      refs: 0,
      pendingDisable: false,
      baselineRaw: false,
      changedRawMode: false,
      activeRefs: 0,
      physicalActive: false,
      physicalRawUncertain: false,
      physicalRefHeld: false,
      physicalRefUncertain: false,
      reconcilingPhysical: false,
      physicalReconcileRequested: false,
    };
    rawModeRegistry.set(stdin, state);
  }
  return state;
}

interface CreateStdinControllerOptions {
  appCtx: AppContext;
  exitOnCtrlC: boolean;
  acquireKittyKeyboardDemand: () => () => void;
  isKittyKeyboardReady: () => boolean;
  /** Acquire the output surface after capability preflight and before input modes. */
  beforeManagedInputAcquire: () => boolean;
  isManagedInputSurfaceReady: () => boolean;
  /** Route async terminal-control bytes through the application's output gate. */
  writeTerminalOutput: (data: string, onHandoff?: () => void) => boolean;
  requestTerminalReconcile: () => void;
  reportManagedInputFailure: (error: unknown) => void;
}

export function createStdinController(
  stdin: NodeJS.ReadStream,
  opts: CreateStdinControllerOptions,
): StdinController {
  const { appCtx } = opts;
  let controller!: StdinController;
  const inputSubscriptions = createInputDispatcher({
    acquire() {
      return controller.acquireSemanticInput();
    },
  });
  const sharedIngress = getSharedStdinIngress(stdin);
  interface ApplicationInputSnapshot {
    readonly kind: "subscribers";
    readonly subscribers: readonly InternalInputSubscriber[];
    /** Whether this app had a logical managed-input owner when the fact began. */
    readonly managedInputActive: boolean;
  }
  interface BootstrapApplicationInputSnapshot {
    readonly kind: "bootstrap";
    resolved: ApplicationInputSnapshot | undefined;
  }
  type CapturedApplicationInputSnapshot =
    | ApplicationInputSnapshot
    | BootstrapApplicationInputSnapshot;
  interface PendingApplicationInput {
    readonly fact: InputEvent;
    readonly snapshot: CapturedApplicationInputSnapshot;
  }
  let sharedSubscription: SharedStdinSubscription;
  let sharedSubscriptionActive = false;
  let inputDeliveryActive = false;
  let drainingApplicationInput = false;
  const pendingApplicationInput: PendingApplicationInput[] = [];
  let pendingBootstrapInputSnapshot: BootstrapApplicationInputSnapshot | undefined = {
    kind: "bootstrap",
    resolved: undefined,
  };
  let cleanupErrorSink: ((error: unknown) => void) | null = null;
  let bracketedPasteModeCount = 0;
  let pendingBracketedPasteMode: { readonly enabled: boolean } | undefined;
  let reconcilingBracketedPaste = false;
  let bracketedPasteReconcileRequested = false;
  let bracketedPasteSyncRequested = false;
  let suspended = false;
  let disposed = false;
  let releaseKittyKeyboardDemand: (() => void) | undefined;
  let reconcilingKittyDemand = false;
  let kittyDemandReconcileRequested = false;
  let bracketedPastePhysicallyEnabled = false;
  let bracketedPastePhysicalUncertain = false;
  let localRefs = 0;
  /** Logical managed-input owners, whether or not this stream supports raw mode. */
  let managedInputRefs = 0;
  /** Raw refs that require Runtime's parser and negotiated input protocols. */
  let managedRawRefs = 0;
  /** Raw refs owned by independent public useStdin() hook calls. */
  let publicRawRefs = 0;
  // Only fully published semantic demands grant normalized input delivery.
  let publishedSemanticRefs = 0;
  interface SemanticInputDemand {
    activationRequested: boolean;
    inputAcquired: boolean;
    physicalAcquired: boolean;
    published: boolean;
    released: boolean;
  }
  const semanticInputDemands = new Set<SemanticInputDemand>();
  let reconcilingSemanticInput = false;
  let semanticInputReconcileRequested = false;
  let resumeAwaitingTerminalModes = false;

  // True once bracketed paste has been enabled at least once on this controller
  // (semantic input was active). Lets signal-exit teardown re-issue a SYNCHRONOUS
  // paste-OFF even after Vue's unmount already ran the async disable and zeroed
  // bracketedPasteModeCount (see dispose(sync) below).
  let everEnabledBracketedPaste = false;

  // Write terminal-mode escapes only when stdout can still take them.
  // `isTTY` stays cached-truthy after a stream is destroy()ed/end()ed, so gating
  // the restore write on isTTY alone throws ERR_STREAM_DESTROYED on a teardown
  // where stdout is already gone. Require isTTY AND
  // `!destroyed && !writableEnded`, matching the render-level writeBestEffort
  // helper that is outside this function's scope.
  function canWriteTerminalMode(): boolean {
    const stdout = appCtx.stdout;
    return Boolean(stdout.isTTY) && !stdout.destroyed && !stdout.writableEnded;
  }

  function writeTerminalMode(
    data: string,
    sync = false,
    onHandoff: () => void = () => {},
  ): boolean {
    if (!canWriteTerminalMode()) return false;
    const stdout = appCtx.stdout;
    if (sync) {
      // The base WriteStream type doesn't declare `fd`; tty/fs streams do.
      // Let failures propagate to the reconciler: OFF transitions are retried
      // once before the outer signal/suspension cleanup swallows the error.
      const streamFd = (stdout as { fd?: number }).fd;
      if (typeof streamFd === "number") {
        fsWriteSync(streamFd, data);
      } else if (stdout === process.stdout) {
        fsWriteSync(1, data);
      } else if (stdout === process.stderr) {
        fsWriteSync(2, data);
      } else {
        stdout.write(data);
      }
      onHandoff();
      return true;
    }
    return opts.writeTerminalOutput(data, onHandoff);
  }

  function runTerminalCleanup(operation: () => void): void {
    try {
      operation();
    } catch (error) {
      // Terminal restoration is a best-effort transaction. A failed write for
      // one mode must not prevent the remaining modes or raw stdin from being
      // restored.
      cleanupErrorSink?.(error);
    }
  }

  function reportTerminalOperationFailure(error: unknown): void {
    if (cleanupErrorSink) {
      cleanupErrorSink(error);
      return;
    }
    opts.reportManagedInputFailure(error);
  }

  function reconcileBracketedPasteMode(sync = false): void {
    bracketedPasteSyncRequested ||= sync;
    if (reconcilingBracketedPaste) {
      bracketedPasteReconcileRequested = true;
      return;
    }

    reconcilingBracketedPaste = true;
    try {
      while (true) {
        bracketedPasteReconcileRequested = false;
        const useSync = bracketedPasteSyncRequested;
        bracketedPasteSyncRequested = false;
        const shouldEnable =
          !disposed && !suspended && bracketedPasteModeCount > 0 && canWriteTerminalMode();
        if (pendingBracketedPasteMode) break;
        if (bracketedPastePhysicalUncertain) {
          const pending = { enabled: false } as const;
          pendingBracketedPasteMode = pending;
          try {
            const accepted = writeTerminalMode("\x1b[?2004l", useSync, () => {
              if (pendingBracketedPasteMode !== pending) return;
              pendingBracketedPasteMode = undefined;
              bracketedPastePhysicallyEnabled = false;
              bracketedPastePhysicalUncertain = false;
              opts.requestTerminalReconcile();
            });
            if (!accepted) {
              if (pendingBracketedPasteMode === pending) pendingBracketedPasteMode = undefined;
              opts.requestTerminalReconcile();
            }
          } catch (error) {
            if (pendingBracketedPasteMode === pending) pendingBracketedPasteMode = undefined;
            bracketedPastePhysicalUncertain = true;
            throw error;
          }
          break;
        }
        if (shouldEnable === bracketedPastePhysicallyEnabled && !bracketedPastePhysicalUncertain) {
          if (!bracketedPasteReconcileRequested) break;
          continue;
        }

        const pending = { enabled: shouldEnable } as const;
        pendingBracketedPasteMode = pending;
        try {
          const accepted = writeTerminalMode(
            shouldEnable ? "\x1b[?2004h" : "\x1b[?2004l",
            useSync,
            () => {
              if (pendingBracketedPasteMode !== pending) return;
              pendingBracketedPasteMode = undefined;
              bracketedPastePhysicallyEnabled = shouldEnable;
              bracketedPastePhysicalUncertain = false;
              if (shouldEnable) everEnabledBracketedPaste = true;
              opts.requestTerminalReconcile();
            },
          );
          if (!accepted) {
            if (pendingBracketedPasteMode === pending) {
              pendingBracketedPasteMode = undefined;
            }
            opts.requestTerminalReconcile();
            break;
          }
        } catch (error) {
          if (pendingBracketedPasteMode === pending) pendingBracketedPasteMode = undefined;
          bracketedPastePhysicalUncertain = true;
          throw error;
        }
        if (pendingBracketedPasteMode) break;
      }
    } finally {
      reconcilingBracketedPaste = false;
    }
  }

  // On an abrupt signal path Vue cleanup may already have issued the normal
  // async OFF and cleared the logical count. Re-issuing OFF synchronously is
  // idempotent and guarantees the restore reaches the terminal before re-raise.
  function forceDisableBracketedPaste(sync: boolean): void {
    writeTerminalMode("\x1b[?2004l", sync);
    pendingBracketedPasteMode = undefined;
    bracketedPastePhysicallyEnabled = false;
    bracketedPastePhysicalUncertain = false;
  }

  function reissueIdempotentTerminalDisables(sync: boolean): void {
    if (everEnabledBracketedPaste) {
      runTerminalCleanup(() => forceDisableBracketedPaste(sync));
    }
  }

  function reconcileSharedSubscription(): void {
    if (
      resumeAwaitingTerminalModes &&
      (managedRawRefs === 0 ||
        (opts.isManagedInputSurfaceReady() &&
          opts.isKittyKeyboardReady() &&
          (!canWriteTerminalMode() ||
            (bracketedPasteModeCount === 0
              ? !bracketedPastePhysicallyEnabled && !bracketedPastePhysicalUncertain
              : bracketedPastePhysicallyEnabled && !bracketedPastePhysicalUncertain)) &&
          pendingBracketedPasteMode === undefined))
    ) {
      resumeAwaitingTerminalModes = false;
    }
    const shouldBeActive =
      !disposed && !suspended && !resumeAwaitingTerminalModes && managedInputRefs > 0;
    if (shouldBeActive === sharedSubscriptionActive) return;
    sharedSubscriptionActive = shouldBeActive;
    sharedSubscription.setActive(shouldBeActive);
  }

  function reconcileKittyDemand(): void {
    if (reconcilingKittyDemand) {
      kittyDemandReconcileRequested = true;
      return;
    }

    reconcilingKittyDemand = true;
    let firstError: unknown;
    let hasError = false;
    let retriedAfterReentry = false;
    try {
      while (true) {
        kittyDemandReconcileRequested = false;
        const shouldHoldDemand = !disposed && managedRawRefs > 0;

        if (shouldHoldDemand && !releaseKittyKeyboardDemand) {
          let release: (() => void) | undefined;
          try {
            release = opts.acquireKittyKeyboardDemand();
          } catch (error) {
            if (!hasError) {
              firstError = error;
              hasError = true;
            }
            // A host callback can create a surviving nested stdin demand before
            // the outer Kitty acquisition fails. Give that newly committed
            // desired state one chance to acquire its own lease.
            if (kittyDemandReconcileRequested && !retriedAfterReentry) {
              retriedAfterReentry = true;
              continue;
            }
            break;
          }

          if (!disposed && managedRawRefs > 0) {
            releaseKittyKeyboardDemand = release;
          } else {
            try {
              release();
            } catch (error) {
              if (!hasError) {
                firstError = error;
                hasError = true;
              }
            }
          }
          continue;
        }

        if (!shouldHoldDemand && releaseKittyKeyboardDemand) {
          const release = releaseKittyKeyboardDemand;
          // Commit the desired state before calling the host-facing release so
          // a reentrant acquisition can request a fresh lease.
          releaseKittyKeyboardDemand = undefined;
          try {
            release();
          } catch (error) {
            if (!hasError) {
              firstError = error;
              hasError = true;
            }
          }
          continue;
        }

        if (!kittyDemandReconcileRequested) break;
      }
    } finally {
      reconcilingKittyDemand = false;
    }
    if (hasError) throw firstError;
  }

  function snapshotCurrentApplicationInput(): ApplicationInputSnapshot {
    return Object.freeze({
      kind: "subscribers",
      subscribers: inputSubscriptions.capture(),
      managedInputActive: publishedSemanticRefs > 0,
    });
  }

  function captureApplicationInputSnapshot(): CapturedApplicationInputSnapshot {
    if (inputDeliveryActive) return snapshotCurrentApplicationInput();
    if (!pendingBootstrapInputSnapshot) {
      throw new Error("Bootstrap input snapshot is unavailable before input activation");
    }
    return pendingBootstrapInputSnapshot;
  }

  function acceptSharedInput(fact: InputEvent, snapshot: CapturedApplicationInputSnapshot): void {
    if (disposed || suspended) return;
    pendingApplicationInput.push({ fact, snapshot });
    flushPendingApplicationInput();
  }

  function flushPendingApplicationInput(): void {
    if (
      !inputDeliveryActive ||
      suspended ||
      drainingApplicationInput ||
      pendingApplicationInput.length === 0
    )
      return;
    drainingApplicationInput = true;
    try {
      while (pendingApplicationInput.length > 0) {
        const pending = pendingApplicationInput.shift()!;
        const snapshot =
          pending.snapshot.kind === "bootstrap" ? pending.snapshot.resolved : pending.snapshot;
        if (!snapshot) {
          pendingApplicationInput.unshift(pending);
          break;
        }
        processInputEvent(pending.fact, snapshot);
      }
    } finally {
      drainingApplicationInput = false;
    }
  }

  function isCtrlC(fact: InputEvent): boolean {
    const event = projectPublicInputEvent(fact);
    const key = event?.type === "paste" ? undefined : event?.key;
    if (!key || key.character !== "c") return false;
    const { shift, alt, ctrl, meta, super: superKey, hyper } = key;
    return ctrl && !shift && !alt && !meta && !superKey && !hyper;
  }

  function processInputEvent(event: InputEvent, snapshot: ApplicationInputSnapshot): void {
    if (suspended || disposed || !snapshot.managedInputActive) return;
    if (opts.exitOnCtrlC && isCtrlC(event)) {
      appCtx.exit();
      return;
    }

    inputSubscriptions.deliver(event, snapshot.subscribers);
  }

  sharedSubscription = sharedIngress.subscribe(captureApplicationInputSnapshot, acceptSharedInput);

  function canAcquireManagedRawMode(): boolean {
    return appCtx.isRawModeSupported && hasRawInputCapability(stdin) && isReadableHostLive(stdin);
  }

  function assertPublicRawModeAvailable(): void {
    if (!appCtx.isRawModeSupported || !hasRawInputCapability(stdin) || !isReadableHostLive(stdin)) {
      throw new Error("Raw mode is unavailable because Runtime cannot control the mounted stdin.");
    }
  }

  function reconcilePhysicalRawMode(state: RawModeState): void {
    if (state.reconcilingPhysical) {
      state.physicalReconcileRequested = true;
      return;
    }

    state.reconcilingPhysical = true;
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
        state.physicalReconcileRequested || recoverWithoutReentry || mustConvergeAfterError;
      if (!shouldRecover || retriedTransitions.has(transition)) return false;
      retriedTransitions.add(transition);
      mustConvergeAfterError = true;
      return true;
    }

    try {
      while (true) {
        state.physicalReconcileRequested = false;
        const shouldBeActive = state.activeRefs > 0 || state.pendingDisable;

        if (shouldBeActive) {
          if (!state.physicalActive || state.physicalRawUncertain) {
            // Commit the transition before calling a hostile stream. Re-entrant
            // suspend/release updates the desired counts; the next loop then
            // compensates instead of letting the outer acquisition overwrite it.
            state.physicalActive = true;
            state.physicalRawUncertain = false;
            if (state.changedRawMode) {
              try {
                appCtx.setRawMode(true);
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
          if (
            (!state.physicalRefHeld || state.physicalRefUncertain) &&
            typeof stdin.ref === "function"
          ) {
            state.physicalRefHeld = true;
            state.physicalRefUncertain = false;
            try {
              stdin.ref();
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
                appCtx.setRawMode(state.baselineRaw);
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
          if (
            (state.physicalRefHeld || state.physicalRefUncertain) &&
            typeof stdin.unref === "function"
          ) {
            state.physicalRefHeld = false;
            state.physicalRefUncertain = false;
            try {
              stdin.unref();
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

        if (!state.physicalReconcileRequested) break;
      }
    } finally {
      state.reconcilingPhysical = false;
    }
    if (hasError) throw firstError;
  }

  function resetRawModeState(state: RawModeState): void {
    state.pendingDisable = false;
    state.activeRefs = 0;
    state.physicalActive = false;
    state.physicalRawUncertain = false;
    state.physicalRefHeld = false;
    state.physicalRefUncertain = false;
    state.baselineRaw = false;
    state.changedRawMode = false;
    state.physicalReconcileRequested = false;
  }

  function resetRawModeStateIfIdle(state: RawModeState): void {
    if (
      state.refs === 0 &&
      state.activeRefs === 0 &&
      !state.pendingDisable &&
      !state.physicalActive &&
      !state.physicalRawUncertain &&
      !state.physicalRefHeld &&
      !state.physicalRefUncertain &&
      !state.reconcilingPhysical
    ) {
      resetRawModeState(state);
    }
  }

  function setSemanticDemandPublished(demand: SemanticInputDemand, published: boolean): void {
    if (demand.published === published) return;
    demand.published = published;
    publishedSemanticRefs += published ? 1 : -1;
  }

  function setSemanticDemandInputAcquired(demand: SemanticInputDemand, acquired: boolean): void {
    if (demand.inputAcquired === acquired) return;
    demand.inputAcquired = acquired;
    if (acquired) {
      if (managedInputRefs === 0 && inputDeliveryActive) {
        sharedSubscription.invalidate();
      }
      managedInputRefs++;
    } else {
      managedInputRefs = Math.max(0, managedInputRefs - 1);
      if (managedInputRefs === 0) {
        sharedSubscription.invalidate();
        pendingApplicationInput.length = 0;
      }
    }
    reconcileSharedSubscription();
  }

  function semanticTerminalModesReady(): boolean {
    const pasteReady =
      !canWriteTerminalMode() ||
      (bracketedPastePhysicallyEnabled &&
        !bracketedPastePhysicalUncertain &&
        pendingBracketedPasteMode === undefined);
    return (
      !suspended && opts.isManagedInputSurfaceReady() && opts.isKittyKeyboardReady() && pasteReady
    );
  }

  function reconcileSemanticInputDemands(): void {
    if (reconcilingSemanticInput) {
      semanticInputReconcileRequested = true;
      return;
    }
    reconcilingSemanticInput = true;
    try {
      do {
        semanticInputReconcileRequested = false;

        for (const demand of semanticInputDemands) {
          if (demand.released) {
            setSemanticDemandPublished(demand, false);
            let releaseError: unknown;
            try {
              setSemanticDemandInputAcquired(demand, false);
            } catch (error) {
              releaseError = error;
            }
            if (demand.physicalAcquired) {
              demand.physicalAcquired = false;
              try {
                controller.setBracketedPasteMode(false);
              } catch (error) {
                releaseError ??= error;
              }
              try {
                releaseLogicalRawMode(true);
              } catch (error) {
                releaseError ??= error;
              }
              semanticInputDemands.delete(demand);
              if (releaseError !== undefined) throw releaseError;
              continue;
            }
            semanticInputDemands.delete(demand);
            if (releaseError !== undefined) throw releaseError;
            continue;
          }

          if (!demand.inputAcquired && !suspended) {
            try {
              setSemanticDemandInputAcquired(demand, true);
              if (canAcquireManagedRawMode()) {
                const acquired = acquireLogicalRawMode(true) !== false;
                if (!acquired) {
                  setSemanticDemandInputAcquired(demand, false);
                  opts.requestTerminalReconcile();
                  continue;
                }
                demand.physicalAcquired = true;
                controller.setBracketedPasteMode(true);
              }
            } catch (error) {
              if (demand.physicalAcquired) {
                demand.physicalAcquired = false;
                runTerminalCleanup(() => controller.setBracketedPasteMode(false));
                runTerminalCleanup(() => releaseLogicalRawMode(true));
              }
              runTerminalCleanup(() => setSemanticDemandInputAcquired(demand, false));
              throw error;
            }
          }
        }

        reconcileBracketedPasteMode();
        const ready = semanticTerminalModesReady();
        for (const demand of semanticInputDemands) {
          setSemanticDemandPublished(
            demand,
            !demand.released &&
              demand.activationRequested &&
              demand.inputAcquired &&
              (!demand.physicalAcquired || ready),
          );
        }
      } while (semanticInputReconcileRequested);
    } finally {
      reconcilingSemanticInput = false;
    }
  }

  function acquireLogicalRawMode(managed: boolean): boolean {
    if (disposed) {
      throw new Error("Cannot acquire raw mode after the vue-tui application has unmounted");
    }
    if (managed) {
      if (!suspended && !opts.beforeManagedInputAcquire()) return false;
    } else {
      assertPublicRawModeAvailable();
    }

    const state = getRawModeState(stdin);
    const firstSharedRef = state.refs === 0;
    const localRefsBefore = localRefs;
    const kindRefsBefore = managed ? managedRawRefs : publicRawRefs;
    let committedRef = false;
    try {
      if (
        firstSharedRef &&
        !state.pendingDisable &&
        !state.physicalActive &&
        !state.physicalRawUncertain &&
        !state.physicalRefHeld &&
        !state.physicalRefUncertain
      ) {
        state.baselineRaw = Boolean((stdin as { isRaw?: boolean }).isRaw);
        state.changedRawMode = !state.baselineRaw;
      }
      const participatesPhysically = !suspended;
      state.refs++;
      if (participatesPhysically) state.activeRefs++;
      localRefs++;
      if (managed) managedRawRefs++;
      else publicRawRefs++;
      committedRef = true;
      if (participatesPhysically) state.pendingDisable = false;
      reconcilePhysicalRawMode(state);
      reconcileSharedSubscription();
      reconcileKittyDemand();
    } catch (error) {
      // A re-entrant dispose/release may already have consumed this logical
      // acquisition. Roll back only this still-surviving kind of ref.
      const kindRefs = managed ? managedRawRefs : publicRawRefs;
      if (committedRef && !disposed && localRefs > localRefsBefore && kindRefs > kindRefsBefore) {
        state.refs = Math.max(0, state.refs - 1);
        if (!suspended) state.activeRefs = Math.max(0, state.activeRefs - 1);
        localRefs = Math.max(0, localRefs - 1);
        if (managed) managedRawRefs = Math.max(0, managedRawRefs - 1);
        else publicRawRefs = Math.max(0, publicRawRefs - 1);
      }
      if (state.activeRefs === 0) state.pendingDisable = false;
      runTerminalCleanup(() => reconcilePhysicalRawMode(state));
      resetRawModeStateIfIdle(state);
      runTerminalCleanup(reconcileSharedSubscription);
      runTerminalCleanup(reconcileKittyDemand);
      throw error;
    }
    return true;
  }

  function releaseLogicalRawMode(managed: boolean): void {
    if (!appCtx.isRawModeSupported) return;
    if (managed ? managedRawRefs === 0 : publicRawRefs === 0) return;
    const state = getRawModeState(stdin);
    state.refs = Math.max(0, state.refs - 1);
    if (!suspended) state.activeRefs = Math.max(0, state.activeRefs - 1);
    localRefs = Math.max(0, localRefs - 1);
    if (managed) managedRawRefs = Math.max(0, managedRawRefs - 1);
    else publicRawRefs = Math.max(0, publicRawRefs - 1);
    let firstError: unknown;
    let hasError = false;
    try {
      reconcileKittyDemand();
    } catch (error) {
      firstError = error;
      hasError = true;
    }
    try {
      reconcileSharedSubscription();
    } catch (error) {
      if (!hasError) {
        firstError = error;
        hasError = true;
      }
    }
    if (
      state.activeRefs === 0 &&
      (state.physicalActive ||
        state.physicalRawUncertain ||
        state.physicalRefHeld ||
        state.physicalRefUncertain)
    ) {
      // Defer only the shared physical toggle, allowing a same-tick replacement
      // hook or managed route to inherit the already-active terminal state.
      state.pendingDisable = true;
      queueMicrotask(() => {
        if (!state.pendingDisable || state.activeRefs > 0) return;
        state.pendingDisable = false;
        try {
          reconcilePhysicalRawMode(state);
        } catch (error) {
          reportTerminalOperationFailure(error);
        } finally {
          resetRawModeStateIfIdle(state);
        }
      });
    } else {
      resetRawModeStateIfIdle(state);
    }
    if (hasError) throw firstError;
  }

  controller = {
    stdin,
    isRawModeSupported: appCtx.isRawModeSupported,
    inputSubscriptions,
    setCleanupErrorSink(sink) {
      cleanupErrorSink = sink;
    },
    acquirePublicRawMode() {
      acquireLogicalRawMode(false);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        releaseLogicalRawMode(false);
      };
    },
    acquireSemanticInput() {
      try {
        const demand: SemanticInputDemand = {
          activationRequested: false,
          inputAcquired: false,
          physicalAcquired: false,
          published: false,
          released: false,
        };
        semanticInputDemands.add(demand);
        try {
          reconcileSemanticInputDemands();
        } catch (error) {
          demand.released = true;
          runTerminalCleanup(reconcileSemanticInputDemands);
          throw error;
        }
        return Object.freeze({
          activate() {
            if (demand.released || demand.activationRequested) return;
            demand.activationRequested = true;
            try {
              reconcileSemanticInputDemands();
            } catch (error) {
              opts.reportManagedInputFailure(error);
              throw error;
            }
          },
          release() {
            if (demand.released) return;
            demand.activationRequested = false;
            setSemanticDemandPublished(demand, false);
            // Vue removes an old branch before mounting its same-tick replacement.
            // Keep the physical lease until the microtask boundary so a
            // replacement can acquire without a listener/raw-mode gap.
            queueMicrotask(() => {
              if (demand.released) return;
              demand.released = true;
              try {
                reconcileSemanticInputDemands();
              } catch (error) {
                reportTerminalOperationFailure(error);
              }
            });
          },
        });
      } catch (error) {
        opts.reportManagedInputFailure(error);
        throw error;
      }
    },
    hasManagedInputDemand() {
      return !disposed && managedInputRefs > 0;
    },
    startKittyQueryResponseDetection(onResult) {
      let settled = false;
      let cancelSharedDetection:
        | ReturnType<SharedStdinIngress["startKittyQueryResponseDetection"]>
        | undefined;
      cancelSharedDetection = sharedIngress.startKittyQueryResponseDetection((supported) => {
        if (settled) return;
        settled = true;
        onResult(supported);
      }, sharedSubscription);
      return (options) => {
        if (settled) return;
        settled = true;
        let firstError: unknown;
        try {
          cancelSharedDetection?.(options);
        } catch (error) {
          firstError = error;
        }
        if (firstError !== undefined) throw firstError;
      };
    },
    activateInputDelivery() {
      if (inputDeliveryActive || disposed) return;
      // Input received beside a synchronous Kitty query reply can predate Vue
      // setup. Bind that bootstrap sentinel to the complete initial subscriber
      // set, then retain this exact snapshot even if a subscription changes before the
      // split event finishes.
      const initialSnapshot = snapshotCurrentApplicationInput();
      if (pendingBootstrapInputSnapshot) pendingBootstrapInputSnapshot.resolved = initialSnapshot;
      // Ingress recipient snapshots for events that actually began before
      // activation retain the binding object. Drop the controller's reference
      // so initial component callbacks are not kept alive for the full app.
      pendingBootstrapInputSnapshot = undefined;
      inputDeliveryActive = true;
      flushPendingApplicationInput();
      if (managedInputRefs === 0) {
        sharedSubscription.invalidate();
        pendingApplicationInput.length = 0;
        reconcileSharedSubscription();
      }
    },
    reconcileTerminalState() {
      if (disposed) return;
      // Resolve subscription changes before retrying an ambiguous terminal
      // mode so bracketed paste observes the newest reference count.
      reconcileSemanticInputDemands();
      reconcileBracketedPasteMode();
      reconcileSharedSubscription();
      flushPendingApplicationInput();
    },
    abandonPendingTerminalOutput(options) {
      if (options?.physicalStateUncertain) {
        if (pendingBracketedPasteMode) bracketedPastePhysicalUncertain = true;
      }
      pendingBracketedPasteMode = undefined;
      for (const demand of semanticInputDemands) {
        if (demand.physicalAcquired && !semanticTerminalModesReady()) {
          setSemanticDemandPublished(demand, false);
        }
      }
      if (options?.physicalStateUncertain) {
        // The coordinator is idle before it reports a physical stream failure.
        // Converge immediately to a terminal-safe paste-OFF state.
        runTerminalCleanup(reconcileBracketedPasteMode);
      } else {
        opts.requestTerminalReconcile();
      }
    },
    setBracketedPasteMode(enabled: boolean) {
      if (disposed) return;
      if (enabled) {
        const bracketedPasteModeCountBefore = bracketedPasteModeCount;
        bracketedPasteModeCount++;
        try {
          reconcileBracketedPasteMode();
        } catch (error) {
          if (!disposed && bracketedPasteModeCount > bracketedPasteModeCountBefore) {
            bracketedPasteModeCount--;
          }
          runTerminalCleanup(reconcileBracketedPasteMode);
          throw error;
        }
      } else {
        if (bracketedPasteModeCount === 0) return;
        bracketedPasteModeCount--;
        // Let the semantic release finish before retrying an ambiguous OFF. A
        // re-entrant replacement can then establish the newest desired count,
        // so reconciliation emits ON directly instead of an obsolete second
        // OFF followed by ON.
        try {
          reconcileBracketedPasteMode();
        } catch (error) {
          // A custom stream may accept OFF and then throw while this reconciler
          // is still on the stack. Retry the idempotent cleanup after it has
          // unwound, then preserve the original release error for the caller's
          // existing best-effort cleanup boundary.
          runTerminalCleanup(reconcileBracketedPasteMode);
          throw error;
        }
      }
    },
    suspend(sync = false) {
      if (suspended) return;
      suspended = true;
      resumeAwaitingTerminalModes = false;
      for (const demand of semanticInputDemands) setSemanticDemandPublished(demand, false);
      // Keep a physical framing unit that began before suspension long enough
      // to find its boundary, but invalidate this app as a recipient. That lets
      // a sole app resume after a split CSI/paste/UTF-8 unit without receiving
      // the old unit's tail. Ordinary consumer release does not retain framing.
      runTerminalCleanup(() => sharedSubscription.invalidate({ retainPending: true }));
      pendingApplicationInput.length = 0;
      runTerminalCleanup(reconcileSharedSubscription);

      runTerminalCleanup(() => reconcileBracketedPasteMode(sync));

      if (appCtx.isRawModeSupported) {
        const state = getRawModeState(stdin);
        state.activeRefs = Math.max(0, state.activeRefs - localRefs);
        state.pendingDisable = false;
        runTerminalCleanup(() => reconcilePhysicalRawMode(state));
        resetRawModeStateIfIdle(state);
      }
    },
    resume() {
      if (!suspended) return;
      const state = appCtx.isRawModeSupported ? getRawModeState(stdin) : undefined;
      let addedActiveRawRefs = 0;

      suspended = false;
      resumeAwaitingTerminalModes = true;
      try {
        // Reacquire raw input first. The shared reconciler re-checks desired
        // counts after every host callback, so a synchronous re-entrant suspend
        // wins without leaving an active logical ref on a cooked terminal.
        if (state && localRefs > 0) {
          state.pendingDisable = false;
          state.activeRefs += localRefs;
          addedActiveRawRefs = localRefs;
          reconcilePhysicalRawMode(state);
        }
        if (suspended || disposed) return;
        reconcileBracketedPasteMode();
        if (suspended || disposed) return;
        // Only expose buffered input after parser-affecting terminal modes are active.
        reconcileSemanticInputDemands();
        reconcileSharedSubscription();
        flushPendingApplicationInput();
      } catch (error) {
        if (addedActiveRawRefs > 0 && state && !suspended && !disposed) {
          state.activeRefs = Math.max(
            0,
            state.activeRefs - Math.min(addedActiveRawRefs, localRefs),
          );
        }
        if (!disposed) suspended = true;
        resumeAwaitingTerminalModes = false;
        runTerminalCleanup(reconcileBracketedPasteMode);
        if (state) {
          state.pendingDisable = false;
          runTerminalCleanup(() => reconcilePhysicalRawMode(state));
          resetRawModeStateIfIdle(state);
        }
        runTerminalCleanup(reconcileSharedSubscription);
        throw error;
      }
    },
    dispose(sync = false, reissueAbruptTerminalDisables = sync) {
      if (disposed) {
        // A captured asynchronous restoration can fail only when its transaction
        // reaches the stream. Keep repeated synchronous disposal useful so the
        // emergency path can re-send terminal OFF modes after that late failure.
        if (sync && reissueAbruptTerminalDisables) {
          reissueIdempotentTerminalDisables(true);
        }
        return;
      }
      disposed = true;
      runTerminalCleanup(reconcileKittyDemand);
      pendingApplicationInput.length = 0;
      inputDeliveryActive = false;
      drainingApplicationInput = false;
      sharedSubscriptionActive = false;
      // A hostile stream may throw while removing the final data listener.
      // Input ownership failure must not skip paste/Kitty/raw cleanup.
      runTerminalCleanup(() => sharedSubscription.dispose());
      inputSubscriptions.clear();
      for (const demand of semanticInputDemands) {
        demand.released = true;
        demand.inputAcquired = false;
        demand.physicalAcquired = false;
        setSemanticDemandPublished(demand, false);
      }
      managedInputRefs = 0;
      semanticInputDemands.clear();
      // Normal teardown itself owns one unhanded output transaction. Preserve
      // terminal-mode callbacks captured by Vue scope cleanup so the handoff
      // commits their physical state exactly once. Abrupt teardown aborts that
      // transaction and explicitly abandons these pending callbacks first.
      if (sync) {
        pendingBracketedPasteMode = undefined;
      }
      resumeAwaitingTerminalModes = false;
      runTerminalCleanup(() => reconcileBracketedPasteMode(sync));
      if (sync && reissueAbruptTerminalDisables) {
        // The paste-off escape must flush synchronously on signal exit. By the
        // time dispose() runs, Vue's unmount has usually
        // already disposed the semantic-input lease, which wrote `\x1b[?2004l`
        // ASYNC and zeroed the count — and that
        // async write is exactly what signal-exit's immediate re-raise can drop.
        // So re-issue it SYNCHRONOUSLY here whenever paste was ever enabled, not
        // gated on the (now-zero) live count. Re-sending paste-OFF is idempotent:
        // disabling an already-disabled mode is a terminal no-op, so a redundant
        // sync write after a surviving async one is harmless. If detach hasn't run
        // yet (count still > 0), this single sync write still covers it.
        reissueIdempotentTerminalDisables(true);
      } else {
        if (bracketedPastePhysicalUncertain) {
          runTerminalCleanup(() => forceDisableBracketedPaste(sync));
        }
      }
      bracketedPasteModeCount = 0;
      if (appCtx.isRawModeSupported) {
        const state = getRawModeState(stdin);
        // Drop this controller's outstanding refs (if Vue's unmount hasn't already
        // released them via onScopeDispose → releaseRawMode).
        if (localRefs > 0) {
          if (!suspended) {
            state.activeRefs = Math.max(0, state.activeRefs - localRefs);
          }
          state.refs = Math.max(0, state.refs - localRefs);
          localRefs = 0;
        }
        managedRawRefs = 0;
        publicRawRefs = 0;
        // Reconcile terminal raw mode synchronously when ownership changes. This
        // covers BOTH teardown orderings:
        //   (1) dispose() ran while this controller still held refs (above), or
        //   (2) Vue's unmount already fired releaseRawMode (localRefs is 0) which
        //       DEFERRED the disable to a microtask — but on the signal-exit path
        //       (teardown(true) re-raises the signal without draining microtasks)
        //       that microtask never runs, so the terminal would be left raw and
        //       the shell stops echoing after Ctrl+C.
        // Clearing pendingDisable also cancels the queued microtask so it cannot
        // double-unref. The shared reconciler keeps another app's active lease.
        state.pendingDisable = false;
        runTerminalCleanup(() => reconcilePhysicalRawMode(state));
        resetRawModeStateIfIdle(state);
      }
      suspended = false;
    },
  };

  return controller;
}
