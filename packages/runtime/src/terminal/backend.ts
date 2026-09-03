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

/** A paired ownership handle for one terminal-wide mode. */
export interface TerminalLease<Mode extends TerminalMode = TerminalMode> {
  readonly mode: Mode;
  release(): void;
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
  acquire<Mode extends TerminalMode>(mode: Mode): TerminalLease<Mode>;
  /**
   * Whether any lease on this mode is outstanding. Both backends share the
   * count; each mode still restores at its own site, which the architecture
   * task list records as the remaining work.
   */
  isModeHeld(mode: TerminalMode): boolean;
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

/**
 * Reference-counted mode ownership, shared by every backend so that the count a
 * test observes is the count production keeps.
 */
export function createModeLedger(): {
  acquire<Mode extends TerminalMode>(mode: Mode): TerminalLease<Mode>;
  isModeHeld(mode: TerminalMode): boolean;
} {
  const counts = new Map<TerminalMode, number>();
  return {
    acquire<Mode extends TerminalMode>(mode: Mode): TerminalLease<Mode> {
      counts.set(mode, (counts.get(mode) ?? 0) + 1);
      let active = true;
      return Object.freeze({
        mode,
        release() {
          if (!active) return;
          active = false;
          const next = Math.max(0, (counts.get(mode) ?? 1) - 1);
          if (next === 0) counts.delete(mode);
          else counts.set(mode, next);
        },
      });
    },
    isModeHeld(mode) {
      return (counts.get(mode) ?? 0) > 0;
    },
  };
}
