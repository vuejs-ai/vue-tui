import { Unicode11Addon } from "@xterm/addon-unicode11";
import headless from "@xterm/headless";

const { Terminal: HeadlessTerminal } = headless;

export interface ScreenSnapshot {
  readonly activeBuffer: "normal" | "alternate";
  readonly dimensions: {
    readonly columns: number;
    readonly rows: number;
  };
  /** Visible rows in the active buffer, including trailing cell spaces. */
  readonly lines: readonly string[];
  /** Rows above the normal buffer's current viewport. */
  readonly scrollback: readonly string[];
  readonly cursor: {
    readonly column: number;
    readonly row: number;
    /** Whether the terminal's DECTCEM cursor mode is visible. */
    readonly visible: boolean;
  };
}

export interface TerminalEmulator {
  write(data: string | Uint8Array): void;
  resize(columns: number, rows: number): Promise<void>;
  flush(): Promise<void>;
  snapshot(): Promise<ScreenSnapshot>;
  dispose(): void;
}

export interface TerminalEmulatorOptions {
  /** Apply the TTY output line discipline that moves LF to column zero. */
  readonly convertEol?: boolean;
}

function readLine(
  buffer: ReturnType<InstanceType<typeof HeadlessTerminal>["buffer"]["active"]["getLine"]>,
): string {
  return buffer?.translateToString(false) ?? "";
}

interface HeadlessCursorState {
  readonly _core?: {
    readonly coreService?: {
      readonly isCursorHidden?: unknown;
    };
  };
}

function isCursorVisible(terminal: InstanceType<typeof HeadlessTerminal>): boolean {
  // @xterm/headless 6.0.0 does not expose DECTCEM through its public `modes`
  // API. Its parser-owned core service is the authoritative state for CSI
  // ?25h/?25l and the reset semantics xterm actually applies. Duplicating that
  // state in this host would allow the snapshot to disagree with the emulator.
  const hidden = (terminal as unknown as HeadlessCursorState)._core?.coreService?.isCursorHidden;
  if (typeof hidden !== "boolean") {
    throw new Error("The terminal emulator does not expose its cursor visibility state.");
  }
  return !hidden;
}

export function createTerminalEmulator(
  columns: number,
  rows: number,
  options: TerminalEmulatorOptions = {},
): TerminalEmulator {
  const terminal = new HeadlessTerminal({
    cols: columns,
    rows,
    scrollback: 10_000,
    allowProposedApi: true,
    convertEol: options.convertEol ?? false,
  });
  const unicode = new Unicode11Addon();
  terminal.loadAddon(unicode);
  terminal.unicode.activeVersion = "11";
  let pending = Promise.resolve();
  let disposed = false;

  function assertActive(): void {
    if (disposed) throw new Error("Test host has been disposed.");
  }

  function enqueue(operation: () => void | Promise<void>): Promise<void> {
    const queued = pending.then(operation);
    // Keep the ordering barrier usable after a caller-observed operation fails.
    // `queued` still rejects to its caller; the private barrier only prevents a
    // later fire-and-forget write from cloning that rejection as an unhandled one.
    pending = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  function write(data: string | Uint8Array): void {
    if (disposed) return;
    void enqueue(() => {
      // Cleanup is synchronous, so a write may have been queued immediately before disposal.
      // Recheck here before touching the already-disposed xterm instance.
      if (disposed) return;
      return new Promise<void>((resolve) => {
        terminal.write(data, resolve);
      });
    });
  }

  async function flush(): Promise<void> {
    assertActive();
    await pending;
    assertActive();
  }

  return {
    write,
    resize(nextColumns, nextRows) {
      assertActive();
      return enqueue(() => {
        assertActive();
        terminal.resize(nextColumns, nextRows);
      });
    },
    flush,
    async snapshot() {
      assertActive();
      await flush();
      const active = terminal.buffer.active;
      const normal = terminal.buffer.normal;
      return Object.freeze({
        activeBuffer: active.type,
        dimensions: Object.freeze({ columns: terminal.cols, rows: terminal.rows }),
        lines: Object.freeze(
          Array.from({ length: terminal.rows }, (_, row) =>
            readLine(active.getLine(active.viewportY + row)),
          ),
        ),
        scrollback: Object.freeze(
          Array.from({ length: normal.viewportY }, (_, row) => readLine(normal.getLine(row))),
        ),
        cursor: Object.freeze({
          column: active.cursorX,
          row: active.cursorY,
          visible: isCursorVisible(terminal),
        }),
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const errors: unknown[] = [];
      try {
        unicode.dispose();
      } catch (error) {
        errors.push(error);
      }
      try {
        terminal.dispose();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) {
        throw new AggregateError(errors, "Failed to dispose the terminal emulator.");
      }
    },
  };
}
