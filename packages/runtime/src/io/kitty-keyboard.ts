// packages/runtime/src/io/kitty-keyboard.ts

import { writeSync as fsWriteSync } from "node:fs";

export const kittyFlags = {
  disambiguateEscapeCodes: 1,
  reportEventTypes: 2,
  reportAlternateKeys: 4,
  reportAllKeysAsEscapeCodes: 8,
  reportAssociatedText: 16,
} as const;

export type KittyFlagName = keyof typeof kittyFlags;

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
  flags?: KittyFlagName[];
};

export function resolveFlags(flags: KittyFlagName[]): number {
  let result = 0;
  for (const flag of flags) {
    result |= kittyFlags[flag];
  }
  return result;
}

const ESC = 0x1b;
const OPEN_BRACKET = 0x5b;
const QUESTION_MARK = 0x3f;
const LETTER_U = 0x75;
const ZERO = 0x30;
const NINE = 0x39;

const isDigitByte = (byte: number): boolean => byte >= ZERO && byte <= NINE;

type KittyQueryMatch = { state: "complete"; endIndex: number } | { state: "partial" };

export function matchKittyQueryResponse(
  buffer: number[],
  startIndex: number,
): KittyQueryMatch | undefined {
  if (
    buffer[startIndex] !== ESC ||
    buffer[startIndex + 1] !== OPEN_BRACKET ||
    buffer[startIndex + 2] !== QUESTION_MARK
  ) {
    return undefined;
  }

  let index = startIndex + 3;
  const digitsStart = index;
  while (index < buffer.length && isDigitByte(buffer[index]!)) {
    index++;
  }

  if (index === digitsStart) {
    return undefined;
  }

  if (index === buffer.length) {
    return { state: "partial" };
  }

  if (buffer[index] === LETTER_U) {
    return { state: "complete", endIndex: index };
  }

  return undefined;
}

export function hasCompleteKittyQueryResponse(buffer: number[]): boolean {
  for (let index = 0; index < buffer.length; index++) {
    const match = matchKittyQueryResponse(buffer, index);
    if (match?.state === "complete") {
      return true;
    }
  }
  return false;
}

export function stripKittyQueryResponsesAndTrailingPartial(buffer: number[]): number[] {
  const kept: number[] = [];
  let index = 0;
  while (index < buffer.length) {
    const match = matchKittyQueryResponse(buffer, index);
    if (match?.state === "complete") {
      index = match.endIndex + 1;
      continue;
    }
    if (match?.state === "partial") {
      break;
    }
    kept.push(buffer[index]!);
    index++;
  }
  return kept;
}

export interface KittyKeyboardController {
  /** Acquire one semantic-input demand and return its idempotent release. */
  acquireDemand(): () => void;
  /** Temporarily release the physical protocol while retaining its desired configuration. */
  suspend(sync?: boolean): void;
  /** Reacquire the protocol state that was active before suspend(). */
  resume(): void;
  /**
   * @param sync When true, write the disable-kitty escape synchronously
   * (fs.writeSync) so it reaches the fd before an abrupt signal-driven exit
   * re-raises the signal (G18, Finding A). Defaults to async stream.write for
   * the normal unmount path.
   */
  dispose(sync?: boolean): void;
  readonly isEnabled: boolean;
}

export type StartKittyQueryResponseDetection = (
  onResult: (supported: boolean) => void,
) => (options?: { readonly discard?: boolean }) => void;

export function createKittyKeyboardController(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  startQueryResponseDetection: StartKittyQueryResponseDetection,
  options?: KittyKeyboardOptions,
): KittyKeyboardController {
  let enabled = false;
  let disposed = false;
  let suspended = false;
  let cancelDetection: ReturnType<StartKittyQueryResponseDetection> | undefined;
  const configuredMode: "auto" | "enabled" | "disabled" = options
    ? (options.mode ?? "auto")
    : "disabled";
  const configuredFlags: KittyFlagName[] = options?.flags ?? ["disambiguateEscapeCodes"];
  let autoSupport: "unknown" | "supported" | "unsupported" = "unknown";
  let demandCount = 0;
  let pendingDeactivate = false;
  let protocolEnabling = false;
  let protocolDisabling = false;
  let deferredDisableSync = false;

  function canUseControlOutput(): boolean {
    return (
      (stdin as { readonly isTTY?: boolean }).isTTY === true &&
      (stdout as { readonly isTTY?: boolean }).isTTY === true &&
      !(stdout as { readonly destroyed?: boolean }).destroyed &&
      !(stdout as { readonly writableEnded?: boolean }).writableEnded &&
      (stdout as { readonly writable?: boolean }).writable !== false
    );
  }

  function enableProtocol(flags: KittyFlagName[]): void {
    // A Node-compliant synchronous write rejection means the PUSH was not
    // accepted, so do not claim a stack level or compensate with a POP that
    // could remove an external owner's level. Re-entrant suspension, teardown,
    // or demand changes are recorded while the write is in flight and reconciled
    // only after a successful PUSH.
    protocolEnabling = true;
    try {
      stdout.write(`\x1b[>${resolveFlags(flags)}u`);
    } catch (error) {
      protocolEnabling = false;
      deferredDisableSync = false;
      throw error;
    }
    protocolEnabling = false;
    enabled = true;

    const shouldDisable = () => disposed || suspended || demandCount === 0;
    if (shouldDisable()) {
      const sync = deferredDisableSync;
      deferredDisableSync = false;
      disableProtocol(sync);
      // Match the bounded restoration rule used by suspend, last release, and
      // dispose. Re-read desired state because the first POP may re-enter resume
      // or acquire a replacement demand whose new level must remain active.
      if (enabled && shouldDisable()) disableProtocol(sync);
    } else {
      deferredDisableSync = false;
    }
  }

  function disableProtocol(sync = false): boolean {
    if (!enabled) return true;
    if (protocolDisabling) {
      deferredDisableSync ||= sync;
      return false;
    }

    // Keep ownership committed until the POP write succeeds. A re-entrant resume
    // or demand acquisition must not push a replacement while the old level may
    // still exist; a synchronous rejection means the POP was not accepted.
    protocolDisabling = true;
    const effectiveSync = sync || deferredDisableSync;
    deferredDisableSync = false;
    try {
      if (effectiveSync) {
        const streamFd = (stdout as { fd?: number }).fd;
        if (typeof streamFd === "number") {
          fsWriteSync(streamFd, "\x1b[<u");
        } else if (stdout === process.stdout) {
          fsWriteSync(1, "\x1b[<u");
        } else if (stdout === process.stderr) {
          fsWriteSync(2, "\x1b[<u");
        } else if (!stdout.destroyed && !(stdout as { writableEnded?: boolean }).writableEnded) {
          // A custom stream without an fd may model a different terminal. Never
          // guess process fd 1; write through the stream that was actually used.
          stdout.write("\x1b[<u");
        } else {
          protocolDisabling = false;
          return false;
        }
      } else if (!stdout.destroyed && !(stdout as { writableEnded?: boolean }).writableEnded) {
        stdout.write("\x1b[<u");
      } else {
        protocolDisabling = false;
        return false;
      }
    } catch {
      // Terminal restoration is best-effort; a failed Kitty write must not
      // prevent the remaining cursor, screen, paste, mouse, or raw cleanup. The
      // rejected POP leaves the old level owned so active demand needs no new
      // PUSH, while suspension or teardown can retry the POP.
      protocolDisabling = false;
      return false;
    }

    protocolDisabling = false;
    enabled = false;
    deferredDisableSync = false;

    // A resume or replacement demand may have arrived while the accepted POP
    // was in flight. Reacquire only after committing the old level inactive. If
    // the first PUSH is synchronously rejected, give the surviving committed
    // demand one bounded retry before surfacing that first error.
    if (!disposed && !suspended && demandCount > 0) {
      try {
        activateDemand();
      } catch (error) {
        try {
          activateDemand();
        } catch {
          // Preserve the first restoration error.
        }
        throw error;
      }
    }
    return true;
  }

  function confirmKittySupport(flags: KittyFlagName[]): void {
    // Publish a starting sentinel before calling the host. A custom detector may
    // synchronously re-enter demand acquisition or even settle before returning;
    // neither path may start a duplicate query or leave a stale cancel handle.
    const startingDetection = () => {};
    let settled = false;
    cancelDetection = startingDetection;
    let cancel: ReturnType<StartKittyQueryResponseDetection>;
    try {
      cancel = startQueryResponseDetection((supported) => {
        settled = true;
        cancelDetection = undefined;
        autoSupport = supported ? "supported" : "unsupported";
        if (supported && demandCount > 0 && !disposed && !suspended && canUseControlOutput()) {
          try {
            enableProtocol(flags);
          } catch (error) {
            // Detection settles after the acquiring route has committed. A
            // one-shot PUSH rejection must not strand that surviving demand;
            // retry once while preserving the first host error for the ingress.
            try {
              activateDemand();
            } catch {
              // Preserve the first protocol-enable error.
            }
            throw error;
          }
        }
      });
    } catch (error) {
      if (cancelDetection === startingDetection) cancelDetection = undefined;
      throw error;
    }

    if (!settled && cancelDetection === startingDetection) {
      cancelDetection = cancel;
    } else if (!settled) {
      // The controller was suspended, disposed, or otherwise cancelled while
      // the detector host was on the stack. End the returned detector instead
      // of publishing it after that lifecycle transition.
      try {
        cancel();
      } catch {
        // The lifecycle transition already owns cleanup; keep its state.
      }
      return;
    }

    if (settled || disposed || suspended || demandCount === 0) return;

    try {
      stdout.write("\x1b[?u");
    } catch (error) {
      // A synchronous write rejection did not accept a query, so its detector
      // must not remain as a FIFO tombstone ahead of the next mount's reply.
      try {
        cancelDetection?.({ discard: true });
      } catch {
        // Preserve the query write failure; detector teardown is best-effort.
      } finally {
        cancelDetection = undefined;
      }
      throw error;
    }
  }

  function activateDemand(): void {
    if (
      disposed ||
      suspended ||
      demandCount === 0 ||
      configuredMode === "disabled" ||
      enabled ||
      protocolEnabling ||
      protocolDisabling ||
      cancelDetection ||
      !canUseControlOutput()
    ) {
      return;
    }

    if (configuredMode === "enabled" || autoSupport === "supported") {
      enableProtocol(configuredFlags);
      return;
    }
    if (autoSupport === "unknown") confirmKittySupport(configuredFlags);
  }

  function deactivateDemand(sync = false): void {
    let firstError: unknown;
    if (cancelDetection) {
      const cancel = cancelDetection;
      cancelDetection = undefined;
      try {
        // Ordinary cancellation deliberately leaves the finite ingress tombstone
        // so a late reply cannot settle a newer application's query.
        cancel();
      } catch (error) {
        firstError = error;
      }
    }
    // Cancelling the old detector is host code and may synchronously acquire a
    // replacement demand that starts and enables a new generation. Re-read the
    // desired state before popping so the old cleanup cannot disable that new
    // owner's protocol level.
    if (protocolEnabling && (disposed || suspended || demandCount === 0)) {
      deferredDisableSync ||= sync;
    }
    if (enabled && (disposed || suspended || demandCount === 0)) disableProtocol(sync);
    if (firstError !== undefined) throw firstError;
  }

  function scheduleDeactivate(): void {
    if (pendingDeactivate) return;
    pendingDeactivate = true;
    queueMicrotask(() => {
      if (!pendingDeactivate || demandCount > 0 || disposed) return;
      pendingDeactivate = false;
      try {
        deactivateDemand();
        // Match dispose's bounded cleanup: under the normal Writable contract a
        // synchronous throw rejects the pop before acceptance, so retry once at
        // the exact last-demand boundary instead of retaining the protocol until
        // whole-app teardown.
        if (enabled && demandCount === 0) disableProtocol();
      } catch {
        // A release is terminal cleanup. The ingress has already ended the
        // logical detector even if a hostile listener removal reports failure;
        // dispose remains the final restoration backstop.
      }
    });
  }

  const controller: KittyKeyboardController = {
    get isEnabled() {
      return enabled;
    },

    acquireDemand() {
      if (disposed) {
        throw new Error("Cannot acquire Kitty keyboard input after the application unmounted");
      }
      demandCount++;
      if (pendingDeactivate) pendingDeactivate = false;
      try {
        // Always reconcile. A prior hostile host callback may have changed the
        // physical protocol while another logical demand survived.
        activateDemand();
      } catch (error) {
        demandCount = Math.max(0, demandCount - 1);
        try {
          if (!disposed && !suspended && demandCount > 0) activateDemand();
          else deactivateDemand();
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
        demandCount = Math.max(0, demandCount - 1);
        if (demandCount === 0) scheduleDeactivate();
      };
    },

    suspend(sync = false) {
      if (disposed || suspended) return;
      suspended = true;
      pendingDeactivate = false;
      try {
        deactivateDemand(sync);
      } finally {
        // Under the Node Writable contract, a synchronous POP rejection means
        // the escape was not accepted. Retry once before suspension completes;
        // a re-entrant resume clears `suspended` and protects its replacement
        // level from this retry.
        if (enabled && (disposed || suspended || demandCount === 0)) disableProtocol(sync);
      }
    },

    resume() {
      if (disposed || !suspended) return;
      suspended = false;
      try {
        activateDemand();
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
        deactivateDemand(sync);
      } catch {
        // Cleanup continues through the remaining terminal resources.
      }
      // A synchronous stream failure normally means the first pop was not
      // accepted. Retry once inside the same terminal-cleanup pass, and keep
      // repeated dispose calls useful if a hostile stream fails more than once.
      if (enabled) disableProtocol(sync);
      suspended = false;
    },
  };

  return controller;
}
