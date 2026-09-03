import type { TerminalBackend, TerminalLease } from "./backend.ts";

/** Fixed Kitty progressive-enhancement flag: disambiguate escape codes only. */
const KITTY_DISAMBIGUATE_ESCAPE_CODES = 1;

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
   * @param sync When true, write the disable-kitty escape synchronously
   * (fs.writeSync) so it reaches the fd before an abrupt signal-driven exit
   * re-raises the signal. Defaults to async stream.write for
   * the normal unmount path.
   */
  dispose(sync?: boolean): void;
  /** Whether managed input may be published for the current demand. */
  readonly isReady: boolean;
  readonly isEnabled: boolean;
}

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
  let enabled = false;
  let disposed = false;
  let suspended = false;
  const configuredMode: "auto" | "enabled" | "disabled" = options?.mode ?? "auto";
  let autoSupport: "unknown" | "supported" | "unsupported" = "unknown";
  let demandCount = 0;
  let pendingDeactivate = false;
  let protocolLease: TerminalLease<"kitty-keyboard"> | undefined;
  let protocolMayBeEnabled = false;
  let deferredDisableSync = false;
  let nextOutputGeneration = 0;
  let nextDetectionGeneration = 0;
  let reconciling = false;
  let reconcileRequested = false;

  type PendingOutput = {
    readonly generation: number;
    readonly kind: "push" | "query" | "pop";
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

  let pendingOutput: PendingOutput | null = null;
  let activeDetection: ActiveDetection | null = null;

  function canUseControlOutput(): boolean {
    return (
      terminal.capabilities.stdin.isTTY &&
      terminal.capabilities.stdin.canRead &&
      terminal.capabilities.stdout.isTTY &&
      terminal.capabilities.stdout.canWrite
    );
  }

  /**
   * Enabling the protocol needs a readable stdin, because the terminal answers
   * the query there. Restoring it does not: the pop only travels outward, and a
   * stdin that has gone away -- a PTY hangup, a host closing it during teardown
   * -- is exactly when leaving the protocol pushed costs the user their shell.
   *
   * This gates the asynchronous pop, which travels through the output gate. The
   * synchronous one bypasses it deliberately; see `writeSyncPop`.
   */
  function canRestoreControlOutput(): boolean {
    return terminal.capabilities.stdout.canWrite;
  }

  function notifyStateChange(): void {
    onStateChange?.();
  }

  function wantsManagedInput(): boolean {
    return !disposed && !suspended && demandCount > 0;
  }

  function writeControlOutput(
    kind: PendingOutput["kind"],
    data: string,
    commit: () => void,
  ): boolean {
    if (pendingOutput) return true;
    const pending: PendingOutput = { generation: ++nextOutputGeneration, kind, attempted: false };
    pendingOutput = pending;
    let handed = false;
    let accepted = false;

    try {
      accepted = writeOutput(
        data,
        () => {
          if (pendingOutput !== pending) return;
          handed = true;
          pendingOutput = null;
          commit();
          reconcileDesired();
          notifyStateChange();
        },
        () => {
          if (pendingOutput !== pending) return;
          pending.attempted = true;
          if (kind === "push") protocolMayBeEnabled = true;
        },
      );
    } catch (error) {
      if (pendingOutput === pending) pendingOutput = null;
      notifyStateChange();
      throw error;
    }

    // The handoff callback is authoritative if a direct adapter invokes it
    // before returning. Otherwise false means the gate captured nothing, so no
    // ownership may be committed and the desired state remains retryable.
    if (!accepted && !handed && pendingOutput === pending) {
      pendingOutput = null;
      notifyStateChange();
      return false;
    }
    if (pendingOutput === pending) notifyStateChange();
    return accepted || handed;
  }

  function enableProtocol(): boolean {
    // Fixed progressive-enhancement level: only disambiguate escape codes.
    return writeControlOutput("push", `\x1b[>${KITTY_DISAMBIGUATE_ESCAPE_CODES}u`, () => {
      enabled = true;
      protocolMayBeEnabled = false;
      protocolLease ??= terminal.acquire("kitty-keyboard");
    });
  }

  function writeSyncPop(): boolean {
    // No capability gate. This runs on the signal path and on the emergency
    // restore, and the emergency restore is entered because coordinated output
    // just failed -- so the stream's own `destroyed` flag is the least reliable
    // signal available exactly when the pop matters most. `writeSync` tries the
    // file descriptor first and gives up on its own if there is nothing to
    // write to.
    terminal.writeSync("stdout", "\x1b[<u");
    enabled = false;
    protocolMayBeEnabled = false;
    protocolLease?.release();
    protocolLease = undefined;
    deferredDisableSync = false;
    notifyStateChange();
    return true;
  }

  function disableProtocol(sync = false): boolean {
    if (!enabled && !protocolMayBeEnabled) return true;
    if (pendingOutput) {
      deferredDisableSync ||= sync;
      return true;
    }

    const effectiveSync = sync || deferredDisableSync;
    deferredDisableSync = false;
    try {
      if (effectiveSync) {
        return writeSyncPop();
      } else if (canRestoreControlOutput()) {
        return writeControlOutput("pop", "\x1b[<u", () => {
          enabled = false;
          protocolMayBeEnabled = false;
          protocolLease?.release();
          protocolLease = undefined;
          deferredDisableSync = false;
        });
      } else {
        return false;
      }
    } catch {
      // Terminal restoration is best-effort; a failed Kitty write must not
      // prevent the remaining cursor, screen, paste, or raw cleanup. The
      // rejected POP leaves the old level owned so active demand needs no new
      // PUSH, while suspension or teardown can retry the POP.
      return false;
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
      if (pendingOutput?.kind === "query" && !detection.queryHanded) {
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
      const accepted = writeControlOutput("query", "\x1b[?u", () => {
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
    if (pendingOutput) {
      deferredDisableSync ||= sync && !wantsManagedInput();
      return "settled";
    }

    const wantsInput = wantsManagedInput();
    if (protocolMayBeEnabled) {
      return disableProtocol(sync) ? "settled" : "blocked";
    }
    if (!wantsInput) {
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
      const disabled = !enabled || disableProtocol(sync);
      if (cancellationError !== undefined) throw cancellationError;
      return disabled ? "settled" : "blocked";
    }

    if (configuredMode === "disabled" || !canUseControlOutput()) {
      if (activeDetection) cancelDetection({ discard: !activeDetection.queryHanded });
      return "settled";
    }
    if (enabled) return "settled";

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
      deferredDisableSync ||= sync;
      return;
    }

    reconciling = true;
    let effectiveSync = sync || deferredDisableSync;
    deferredDisableSync = false;
    try {
      for (;;) {
        reconcileRequested = false;
        const result = reconcileDesiredOnce(effectiveSync);
        const nextSync = deferredDisableSync;
        deferredDisableSync = false;
        if (pendingOutput) {
          // A synchronous suspend/dispose may arrive after an async PUSH was
          // captured. Preserve that restore requirement until PUSH handoff (or
          // abandonment) decides whether this controller owns a level to POP.
          deferredDisableSync ||= nextSync;
          break;
        }
        effectiveSync = nextSync;
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
        if ((enabled || protocolMayBeEnabled) && !pendingOutput && demandCount === 0) {
          disableProtocol();
        }
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
        return enabled && pendingOutput?.kind !== "pop";
      }
      return activeDetection?.queryHanded === true;
    },

    get isEnabled() {
      return enabled;
    },

    reconcile() {
      reconcileDesired();
    },

    abandonPendingOutput() {
      const pending = pendingOutput;
      if (!pending) return;
      pendingOutput = null;
      if (pending.kind === "push" && pending.attempted) protocolMayBeEnabled = true;
      if (pending.kind === "query" && activeDetection) {
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
        if (
          (enabled || protocolMayBeEnabled) &&
          !pendingOutput &&
          (disposed || suspended || demandCount === 0)
        ) {
          disableProtocol(sync);
        }
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
      if ((enabled || protocolMayBeEnabled) && !pendingOutput) disableProtocol(sync);
      suspended = false;
    },
  };

  return controller;
}
