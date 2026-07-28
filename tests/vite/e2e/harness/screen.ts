import { Unicode11Addon } from "@xterm/addon-unicode11";
import headless from "@xterm/headless";
import { asError } from "./errors.ts";

const { Terminal } = headless;
const END_SYNCHRONIZED_OUTPUT = "\x1b[?2026l";

// Same minimal stripper the runtime's own paint tests use, for the same reason:
// it avoids pulling strip-ansi into a package that needs nothing else from it.
const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:[:;][0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]|[\u001b\u009d]\].*?(?:\u0007|\u001b\\|\u009c)|[\u001b\u0098][\s\S]*?(?:\u0007|\u001b\\|\u009c)|[\u0080-\u009f]/g;

export function stripAnsi(value: string): string {
  return value.replace(ANSI_RE, "");
}

export interface HarnessScreenOptions {
  readonly onData?: (data: string) => void | Promise<void>;
  readonly onBinary?: (data: string) => void | Promise<void>;
}

export interface HarnessScreen {
  readonly revision: number;
  readonly failure: Error | undefined;
  write(data: string | Uint8Array): void;
  flush(): Promise<void>;
  resize(columns: number, rows: number): Promise<void>;
  text(): Promise<string>;
  currentText(): string;
  onChange(listener: () => void): () => void;
  dispose(): Promise<void>;
}

export interface ReplayedScreenFrame {
  readonly endOffset: number;
  readonly text: string;
}

function dimension(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

export function createHarnessScreen(
  columns: number,
  rows: number,
  options: HarnessScreenOptions = {},
): HarnessScreen {
  const terminal = new Terminal({
    cols: dimension(columns, "screen columns"),
    rows: dimension(rows, "screen rows"),
    scrollback: 10_000,
    allowProposedApi: true,
    convertEol: false,
  });
  const unicode = new Unicode11Addon();
  terminal.loadAddon(unicode);
  terminal.unicode.activeVersion = "11";

  const listeners = new Set<() => void>();
  let pending: Promise<void> = Promise.resolve();
  let visibleText = "";
  let revision = 0;
  let failure: Error | undefined;
  let disposing = false;
  let disposed = false;
  let disposePromise: Promise<void> | undefined;

  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const recordFailure = (error: unknown): Error => {
    failure ??= asError(error);
    notify();
    return failure;
  };

  const assertUsable = (): void => {
    if (disposed || disposing) {
      throw new Error("Harness screen has been disposed");
    }
  };

  const readVisibleText = (): string => {
    const buffer = terminal.buffer.active;
    const lines = Array.from({ length: terminal.rows }, (_, row) => {
      return buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "";
    });
    while (lines.at(-1) === "") {
      lines.pop();
    }
    return lines.join("\n");
  };

  const publish = (): void => {
    if (terminal.modes.synchronizedOutputMode) {
      return;
    }
    visibleText = readVisibleText();
    revision++;
    notify();
  };

  const enqueue = (operation: () => void | Promise<void>): Promise<void> => {
    assertUsable();
    const result = pending.then(async () => {
      await operation();
      if (failure !== undefined) {
        throw failure;
      }
    });
    pending = result.then(
      () => undefined,
      (error) => {
        recordFailure(error);
      },
    );
    return result;
  };

  const forwardReply = (
    callback: ((data: string) => void | Promise<void>) | undefined,
    data: string,
  ): void => {
    try {
      const result = callback?.(data);
      if (result !== undefined) {
        void Promise.resolve(result).catch(recordFailure);
      }
    } catch (error) {
      recordFailure(error);
    }
  };

  const inputDisposables = [
    terminal.onData((data) => {
      forwardReply(options.onData, data);
    }),
    terminal.onBinary((data) => {
      forwardReply(options.onBinary, data);
    }),
  ];

  const write = (data: string | Uint8Array): void => {
    const payload = typeof data === "string" ? data : Uint8Array.from(data);
    void enqueue(
      () =>
        new Promise<void>((resolve, reject) => {
          terminal.write(payload, () => {
            try {
              publish();
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        }),
    ).catch(() => {});
  };

  const flush = async (): Promise<void> => {
    assertUsable();
    await pending;
    assertUsable();
    if (failure !== undefined) {
      throw failure;
    }
  };

  const resize = async (nextColumns: number, nextRows: number): Promise<void> => {
    assertUsable();
    const normalizedColumns = dimension(nextColumns, "screen columns");
    const normalizedRows = dimension(nextRows, "screen rows");
    await enqueue(() => {
      terminal.resize(normalizedColumns, normalizedRows);
      publish();
    });
  };

  // Disposal is best effort and idempotent. A harness screen is torn down while
  // the test is already finishing, so a failure here can only obscure the real
  // result; the pty and the socket are closed by the child harness regardless.
  const dispose = (): Promise<void> => {
    disposePromise ??= (async () => {
      disposing = true;
      await pending.catch(() => undefined);
      for (const disposable of [...inputDisposables, unicode, terminal]) {
        try {
          disposable.dispose();
        } catch {
          // A half-disposed xterm cannot make the test result more accurate.
        }
      }
      listeners.clear();
      disposed = true;
      disposing = false;
    })();
    return disposePromise;
  };

  return {
    get revision(): number {
      return revision;
    },
    get failure(): Error | undefined {
      return failure;
    },
    write,
    flush,
    resize,
    async text() {
      await flush();
      return visibleText;
    },
    currentText() {
      assertUsable();
      if (failure !== undefined) {
        throw failure;
      }
      return visibleText;
    },
    onChange(listener) {
      assertUsable();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose,
  };
}

export async function replayScreenFrames(
  output: string,
  columns: number,
  rows: number,
): Promise<readonly ReplayedScreenFrame[]> {
  const screen = createHarnessScreen(columns, rows);
  const frames: ReplayedScreenFrame[] = [];
  let endOffset = 0;
  const unsubscribe = screen.onChange(() => {
    frames.push({ endOffset, text: screen.currentText() });
  });
  try {
    let start = 0;
    let marker = output.indexOf(END_SYNCHRONIZED_OUTPUT, start);
    while (marker !== -1) {
      endOffset = marker + END_SYNCHRONIZED_OUTPUT.length;
      screen.write(output.slice(start, endOffset));
      await screen.flush();
      start = endOffset;
      marker = output.indexOf(END_SYNCHRONIZED_OUTPUT, start);
    }
    if (start < output.length) {
      endOffset = output.length;
      screen.write(output.slice(start));
      await screen.flush();
    }
    return frames;
  } finally {
    unsubscribe();
    await screen.dispose();
  }
}
