/** One terminal destination Runtime can write while preserving cross-stream order. */
export type TerminalOutput = "stdout" | "stderr";
export type TerminalOutputEvent = "drain" | "close" | "finish" | "error";
export type TerminalInputEvent = "close" | "end" | "error";

/** Terminal-wide modes whose ownership must always have a matching release. */
export type TerminalMode =
  | "raw"
  | "alternate-screen"
  | "cursor-visibility"
  | "synchronized-output"
  | "bracketed-paste"
  | "kitty-keyboard";

export interface TerminalModeReleaseOptions {
  /**
   * Write the restore sequence synchronously, so it reaches the device before a
   * signal exit re-raises or an emergency restore abandons the output gate.
   */
  readonly sync?: boolean;
}

/**
 * How a mode's bytes reach the device while a session owns the output gate.
 *
 * `onAttempt` runs immediately before the backend write, including when that
 * call throws; `onHandoff` runs only once the write has been handed off.
 */
export type TerminalModeWrite = (
  data: string,
  onHandoff?: () => void,
  onAttempt?: () => void,
) => boolean;

/** A paired ownership handle for one terminal-wide mode. */
export interface TerminalLease<Mode extends TerminalMode = TerminalMode> {
  readonly mode: Mode;
  /**
   * Re-issue this mode's enable bytes without changing ownership, for output
   * that restates the mode at the head of its own region.
   */
  reassert(): void;
  release(options?: TerminalModeReleaseOptions): void;
}

export interface TerminalOutputCapabilities {
  readonly isTTY: boolean;
  readonly canWrite: boolean;
  /** Host-reported terminal color depth, if the output can determine one. */
  readonly colorDepth?: number;
}

export interface TerminalInputCapabilities {
  readonly isTTY: boolean;
  readonly canRead: boolean;
  readonly canSetRawMode: boolean;
}

/** Live host capabilities exposed through one stable object. */
export interface TerminalCapabilities {
  readonly stdin: TerminalInputCapabilities;
  readonly stdout: TerminalOutputCapabilities;
  readonly stderr: TerminalOutputCapabilities;
  /** Automatic-color policy comes from the backend's host environment. */
  readonly environment: Readonly<Record<string, string | undefined>>;
}

/** The current physical terminal dimensions, or modeled fallback facts. */
export interface TerminalSize {
  readonly columns: number | null;
  readonly rows: number | null;
}

/**
 * Device boundary for a mounted Runtime session.
 *
 * Streams, process globals, fds, and host event emitters stay behind this interface.
 */
export interface TerminalBackend {
  readonly capabilities: TerminalCapabilities;
  readonly size: TerminalSize;
  /** Re-read dimensions without trusting host fields that may lag a resume event. */
  refreshSize(): TerminalSize;
  /** Opaque identity for one selected physical output. */
  outputOwnerFor(output: TerminalOutput): object;
  /** Opaque identity used to share one physical input observer safely. */
  readonly inputOwner: object;
  /**
   * Take one share of a terminal-wide mode. The first holder's arrival issues
   * the mode's enable bytes and the last one's departure issues its restore.
   */
  acquire<Mode extends TerminalMode>(mode: Mode): TerminalLease<Mode>;
  /** Whether any lease on this mode is outstanding. */
  isModeHeld(mode: TerminalMode): boolean;
  /** Whether the device is known to carry this mode now. */
  isModeActive(mode: TerminalMode): boolean;
  /** Whether the device matches this mode's holders, with nothing outstanding. */
  isModeSettled(mode: TerminalMode): boolean;
  /** Install the gate mode writes travel through while a session owns output. */
  attachModeWrites(write: TerminalModeWrite | null): void;
  /** Forget mode writes captured by a transaction that never handed them off. */
  abandonModeOutput(options?: { readonly physicalStateUncertain?: boolean }): void;
  /** Re-run every mode's physical reconciliation against its current holders. */
  reconcileModes(): void;
  /** Drop every lease on one mode and restore the device. */
  restoreMode(mode: TerminalMode, options?: TerminalModeReleaseOptions): void;
  /** Sweep every mode this backend still owns back to its restored state. */
  restoreModes(options?: TerminalModeReleaseOptions): void;
  /** Observe mode transitions the device has taken or refused. */
  onModeChange(listener: ((mode: TerminalMode) => void) | null): void;
  /** Physical raw-mode fact captured from the selected input device. */
  readonly isRawModeEnabled: boolean;
  setRawMode(enabled: boolean): void;
  /** Keep the selected input alive while Runtime owns a raw-mode lease. */
  refInput(): void;
  /** Release Runtime's input liveness hold. */
  unrefInput(): void;
  write(output: TerminalOutput, data: string, onComplete?: (error?: Error | null) => void): boolean;
  writeSync(output: TerminalOutput, data: string): void;
  onOutputEvent(
    output: TerminalOutput,
    event: TerminalOutputEvent,
    listener: (error?: unknown) => void,
  ): () => void;
  onData(listener: (data: string | Uint8Array) => void): () => void;
  onInputEvent(event: TerminalInputEvent, listener: (error?: unknown) => void): () => void;
  onResize(listener: () => void): () => void;
}
