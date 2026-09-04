import type { TerminalBackend, TerminalLease } from "./backend.ts";

export const kittyModifiers = {
  shift: 1,
  alt: 2,
  ctrl: 4,
  super: 8,
  hyper: 16,
  meta: 32,
  capsLock: 64,
  numLock: 128,
} as const;

export type KittyKeyboardOptions = {
  mode?: "auto" | "enabled" | "disabled";
};

/** Repository-only mount override. Production mounts always use private auto negotiation. */
export const INTERNAL_KITTY_KEYBOARD: unique symbol = Symbol.for(
  "@vue-tui/runtime:internal-kitty-keyboard",
);

export interface InternalKittyKeyboardMountOptions {
  readonly mode: "auto" | "enabled" | "disabled";
}

export interface KittyKeyboardController {
  /** Acquire one semantic-input demand and return its idempotent release. */
  acquireDemand(): () => void;
  /** Reconcile the latest logical demand with delivered terminal state. */
  reconcile(): void;
  /** Forget control output captured by a transaction that was abandoned before handoff. */
  abandonPendingOutput(): void;
  /** Temporarily release the physical protocol while retaining its desired configuration. */
  suspend(sync?: boolean): void;
  /** Reacquire the protocol state that was active before suspend(). */
  resume(): void;
  /**
   * @param sync When true, restore the protocol synchronously so the escape
   * reaches the fd before an abrupt signal-driven exit re-raises the signal.
   * Defaults to the coordinated path for the normal unmount route.
   */
  dispose(sync?: boolean): void;
  /** Whether managed input may be published for the current demand. */
  readonly isReady: boolean;
  readonly isEnabled: boolean;
}

/** How the support query reaches the terminal; the protocol itself is a lease. */
export type WriteKittyOutput = (
  data: string,
  onHandoff?: () => void,
  onAttempt?: () => void,
) => boolean;

export type StartKittyQueryResponseDetection = (
  onResult: (supported: boolean) => void,
) => (options?: { readonly discard?: boolean }) => void;

export function createKittyKeyboardController(
  terminal: TerminalBackend,
  startQueryResponseDetection: StartKittyQueryResponseDetection,
  options?: KittyKeyboardOptions,
  writeOutput: WriteKittyOutput = (data, onHandoff, onAttempt) => {
    // A direct backend write can report backpressure after accepting its bytes.
    // The Runtime gate reports false only before it captures this control write.
    onAttempt?.();
    terminal.write("stdout", data);
    onHandoff?.();
    return true;
  },
  onStateChange?: () => void,
): KittyKeyboardController {
  let disposed = false;
  let suspended = false;
  const configuredMode: "auto" | "enabled" | "disabled" = options?.mode ?? "auto";
  let autoSupport: "unknown" | "supported" | "unsupported" = "unknown";
  let demandCount = 0;
  let pendingDeactivate = false;
  /** Held exactly while this controller wants the protocol pushed. */
  let protocolLease: TerminalLease<"kitty-keyboard"> | undefined;
  let nextDetectionGeneration = 0;
  let reconciling = false;
  let reconcileRequested = false;

  type PendingQuery = {
    attempted: boolean;
  };

  type ActiveDetection = {
    readonly generation: number;
    cancel?: ReturnType<StartKittyQueryResponseDetection>;
    cancelRequested?: { readonly discard?: boolean };
    queryHanded: boolean;
    supportedBeforeHandoff: boolean;
    settled: boolean;
  };

  let pendingQuery: PendingQuery | null = null;
  let activeDetection: ActiveDetection | null = null;

  function canUseControlOutput(): boolean {
    return (
      terminal.capabilities.stdin.isTTY &&
      terminal.capabilities.stdin.canRead &&
      terminal.capabilities.stdout.isTTY &&
      terminal.capabilities.stdout.canWrite
    );
  }

  function notifyStateChange(): void {
    onStateChange?.();
  }

  function wantsManagedInput(): boolean {
    return !disposed && !suspended && demandCount > 0;
  }

  /** Whether the protocol is pushed on the device right now. */
  function isProtocolEnabled(): boolean {
    return terminal.isModeActive("kitty-keyboard");
  }

  /** Whether the device already matches this controller's protocol demand. */
  function isProtocolSettled(): boolean {
    return terminal.isModeSettled("kitty-keyboard");
  }

  function writeQuery(data: string, commit: () => void): boolean {
    if (pendingQuery) return true;
    const pending: PendingQuery = { attempted: false };
    pendingQuery = pending;
    let handed = false;
    let accepted = false;

    try {
      accepted = writeOutput(
        data,
        () => {
          if (pendingQuery !== pending) return;
          handed = true;
          pendingQuery = null;
          commit();
          reconcileDesired();
          notifyStateChange();
        },
        () => {
          if (pendingQuery === pending) pending.attempted = true;
        },
      );
    } catch (error) {
      if (pendingQuery === pending) pendingQuery = null;
      notifyStateChange();
      throw error;
    }

    // The handoff callback is authoritative if a direct adapter invokes it
    // before returning. Otherwise false means the gate captured nothing, so no
    // ownership may be committed and the desired state remains retryable.
    if (!accepted && !handed && pendingQuery === pending) {
      pendingQuery = null;
      notifyStateChange();
      return false;
    }
    if (pendingQuery === pending) notifyStateChange();
    return accepted || handed;
  }

  /** Push the protocol by taking its lease; the lease issues the escape. */
  function enableProtocol(): boolean {
    protocolLease ??= terminal.acquire("kitty-keyboard");
    return isProtocolSettled();
  }

  /** Give the protocol lease back; the lease issues the pop. */
  function disableProtocol(sync = false): boolean {
    const lease = protocolLease;
    protocolLease = undefined;
    try {
      lease?.release({ sync });
    } catch {
      // Terminal restoration is best-effort; a failed Kitty write must not
      // prevent the remaining cursor, screen, paste, or raw cleanup. The
      // rejected POP leaves the old level owned so active demand needs no new
      // PUSH, while suspension or teardown can retry the POP.
      return false;
    }
    return isProtocolSettled();
  }

  /** Retry a restore this controller no longer holds a lease for. */
  function retryProtocolRestore(sync: boolean): void {
    if (protocolLease) return;
    try {
      terminal.restoreMode("kitty-keyboard", { sync });
    } catch {
      // Bounded cleanup: dispose remains the final restoration backstop.
    }
  }

  function cancelDetection(options?: { readonly discard?: boolean }): void {
    const detection = activeDetection;
    if (!detection) return;
    activeDetection = null;
    detection.cancelRequested = options;
    if (detection.cancel) detection.cancel(options);
    notifyStateChange();
  }

  function settleDetection(detection: ActiveDetection, supported: boolean): void {
    if (activeDetection !== detection || detection.settled) return;
    detection.settled = true;
    activeDetection = null;
    autoSupport = supported ? "supported" : "unsupported";
    notifyStateChange();
    try {
      reconcileDesired();
    } catch (error) {
      // A detector settles after the acquiring route has committed. Keep a
      // bounded retry for a synchronous host rejection while preserving the
      // first error for the ingress that delivered the response.
      try {
        reconcileDesired();
      } catch {
        // Preserve the first protocol write error.
      }
      throw error;
    }
  }

  function confirmKittySupport(): boolean {
    const detection: ActiveDetection = {
      generation: ++nextDetectionGeneration,
      queryHanded: false,
      supportedBeforeHandoff: false,
      settled: false,
    };
    activeDetection = detection;

    let startingHostDetection = false;
    const onResult = (supported: boolean): void => {
      if (activeDetection !== detection || detection.settled) return;
      if (pendingQuery && !detection.queryHanded) {
        // The host detector that produced this result no longer owns ingress.
        // A captured QUERY can still be abandoned or wait before physical
        // handoff, so replace the detector now and keep continuous ownership of
        // the eventual reply. Do not cache a timeout that happened before the
        // terminal saw the query.
        detection.supportedBeforeHandoff ||= supported;
        if (startingHostDetection) {
          throw new Error("Kitty query detection settled synchronously before output handoff.");
        }
        startHostDetection();
        notifyStateChange();
        return;
      }
      settleDetection(detection, supported);
    };
    const startHostDetection = (): void => {
      detection.cancel = undefined;
      startingHostDetection = true;
      let cancel: ReturnType<StartKittyQueryResponseDetection>;
      try {
        cancel = startQueryResponseDetection(onResult);
      } catch (error) {
        if (activeDetection === detection && !detection.settled) {
          activeDetection = null;
          notifyStateChange();
        }
        throw error;
      } finally {
        startingHostDetection = false;
      }
      if (activeDetection !== detection || detection.settled) {
        if (detection.cancelRequested) {
          try {
            cancel(detection.cancelRequested);
          } catch {
            // The lifecycle transition that cancelled this starting detector
            // owns cleanup; keep its state.
          }
        }
        return;
      }
      detection.cancel = cancel;
      if (detection.cancelRequested) {
        cancel(detection.cancelRequested);
      }
    };

    startHostDetection();
    if (detection.settled || activeDetection !== detection) return true;
    if (!wantsManagedInput() || !canUseControlOutput()) {
      cancelDetection({ discard: true });
      return true;
    }

    try {
      const accepted = writeQuery("\x1b[?u", () => {
        if (activeDetection !== detection) return;
        detection.queryHanded = true;
        if (detection.supportedBeforeHandoff) {
          // A response observed during the physical write is valid even though
          // the stream invokes our handoff callback only after write() returns.
          // Keep the replacement ingress slot as a tombstone for the captured
          // query's possible second reply, then publish cached support.
          try {
            detection.cancel?.();
          } catch {
            // The parser already consumed the supporting reply. Preserve the
            // delivered protocol state even if tombstone cleanup is hostile.
          }
          detection.cancel = undefined;
          settleDetection(detection, true);
        }
      });
      if (!accepted && activeDetection === detection) {
        try {
          cancelDetection({ discard: true });
        } catch {
          // A blocked gate captured no query. Retain demand for reconcile and
          // do not turn detector cleanup into a fatal application error.
        }
      }
      return accepted;
    } catch (error) {
      if (activeDetection === detection) {
        try {
          cancelDetection({ discard: true });
        } catch {
          // Preserve the query write failure.
        }
      }
      throw error;
    }
  }

  function reconcileDesiredOnce(sync: boolean): "settled" | "blocked" {
    if (pendingQuery) return "settled";

    if (!wantsManagedInput()) {
      let cancellationError: unknown;
      if (activeDetection) {
        try {
          // A handed query keeps its finite ingress tombstone while the app is
          // still mounted. Whole-app disposal must release every owned stream
          // listener immediately; an unhanded query can always be discarded
          // because the terminal could not have replied.
          cancelDetection({ discard: disposed || !activeDetection.queryHanded });
        } catch (error) {
          cancellationError = error;
        }
      }
      const disabled = disableProtocol(sync);
      if (cancellationError !== undefined) throw cancellationError;
      return disabled ? "settled" : "blocked";
    }

    if (configuredMode === "disabled" || !canUseControlOutput()) {
      if (activeDetection) cancelDetection({ discard: !activeDetection.queryHanded });
      return "settled";
    }
    if (isProtocolEnabled()) return "settled";

    if (configuredMode === "enabled" || autoSupport === "supported") {
      return enableProtocol() ? "settled" : "blocked";
    }
    if (autoSupport === "unsupported") return "settled";
    if (activeDetection) return "settled";
    return confirmKittySupport() ? "settled" : "blocked";
  }

  function reconcileDesired(sync = false): void {
    if (reconciling) {
      reconcileRequested = true;
      return;
    }

    reconciling = true;
    try {
      for (;;) {
        reconcileRequested = false;
        const result = reconcileDesiredOnce(sync);
        if (result === "blocked" || !reconcileRequested) break;
      }
    } finally {
      reconciling = false;
    }
  }

  function scheduleDeactivate(): void {
    if (pendingDeactivate) return;
    pendingDeactivate = true;
    queueMicrotask(() => {
      if (!pendingDeactivate || demandCount > 0 || disposed) return;
      pendingDeactivate = false;
      try {
        reconcileDesired();
        // Match dispose's bounded cleanup: under the normal Writable contract a
        // synchronous throw rejects the pop before acceptance, so retry once at
        // the exact last-demand boundary instead of retaining the protocol until
        // whole-app teardown.
        if (demandCount === 0) retryProtocolRestore(false);
      } catch {
        // A release is terminal cleanup. The ingress has already ended the
        // logical detector even if a hostile listener removal reports failure;
        // dispose remains the final restoration backstop.
      }
    });
  }

  const controller: KittyKeyboardController = {
    get isReady() {
      if (!wantsManagedInput()) return true;
      if (
        configuredMode === "disabled" ||
        !canUseControlOutput() ||
        autoSupport === "unsupported"
      ) {
        return true;
      }
      if (configuredMode === "enabled" || autoSupport === "supported") {
        return isProtocolEnabled() && isProtocolSettled();
      }
      return activeDetection?.queryHanded === true;
    },

    get isEnabled() {
      return isProtocolEnabled();
    },

    reconcile() {
      reconcileDesired();
    },

    abandonPendingOutput() {
      if (!pendingQuery) return;
      pendingQuery = null;
      if (activeDetection) {
        try {
          cancelDetection({ discard: true });
        } catch {
          // The abandoned transaction is authoritative: no query reached the
          // terminal, so detector cleanup cannot create protocol ownership.
        }
      }
      notifyStateChange();
    },

    acquireDemand() {
      if (disposed) {
        throw new Error("Cannot acquire Kitty keyboard input after the application unmounted");
      }
      const demandCountBefore = demandCount;
      demandCount++;
      if (pendingDeactivate) pendingDeactivate = false;
      try {
        // Always reconcile. A prior hostile host callback may have changed the
        // physical protocol while another logical demand survived.
        reconcileDesired();
      } catch (error) {
        if (!disposed && demandCount > demandCountBefore) {
          demandCount--;
        }
        try {
          reconcileDesired();
        } catch {
          // Preserve the outer acquisition error. A later lifecycle transition
          // or acquisition will reconcile the surviving desired state again.
        }
        throw error;
      }

      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (demandCount > 0) {
          demandCount--;
        }
        if (demandCount === 0) scheduleDeactivate();
      };
    },

    suspend(sync = false) {
      if (disposed || suspended) return;
      suspended = true;
      pendingDeactivate = false;
      try {
        reconcileDesired(sync);
      } finally {
        // Under the Node Writable contract, a synchronous POP rejection means
        // the escape was not accepted. Retry once before suspension completes;
        // a re-entrant resume clears `suspended` and protects its replacement
        // level from this retry.
        if (disposed || suspended || demandCount === 0) retryProtocolRestore(sync);
      }
    },

    resume() {
      if (disposed || !suspended) return;
      suspended = false;
      try {
        reconcileDesired();
      } catch (error) {
        suspended = true;
        throw error;
      }
    },

    dispose(sync = false) {
      if (!disposed) {
        disposed = true;
        pendingDeactivate = false;
        demandCount = 0;
      }
      try {
        reconcileDesired(sync);
      } catch {
        // Cleanup continues through the remaining terminal resources.
      }
      // A synchronous stream failure normally means the first pop was not
      // accepted. Retry once inside the same terminal-cleanup pass, and keep
      // repeated dispose calls useful if a hostile stream fails more than once.
      retryProtocolRestore(sync);
      suspended = false;
    },
  };

  return controller;
}
