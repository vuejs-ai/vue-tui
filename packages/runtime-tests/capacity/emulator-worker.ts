import { createRequire } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

const requireFromTesting = createRequire(
  new URL("../../testing/package.json", import.meta.url).pathname,
);
const { Terminal: HeadlessTerminal } = requireFromTesting("@xterm/headless") as {
  Terminal: new (options: Record<string, unknown>) => HeadlessTerminalInstance;
};
const { Unicode11Addon } = requireFromTesting("@xterm/addon-unicode11") as {
  Unicode11Addon: new () => UnicodeAddonInstance;
};

interface UnicodeAddonInstance {
  dispose(): void;
}

interface BufferLine {
  translateToString(trimRight?: boolean): string;
}

interface BufferState {
  readonly type: "normal" | "alternate";
  readonly viewportY: number;
  getLine(row: number): BufferLine | undefined;
}

interface HeadlessTerminalInstance {
  readonly rows: number;
  readonly buffer: { readonly active: BufferState; readonly normal: BufferState };
  readonly unicode: { activeVersion: string };
  readonly _core?: { readonly coreService?: { readonly isCursorHidden?: unknown } };
  loadAddon(addon: UnicodeAddonInstance): void;
  resize(columns: number, rows: number): void;
  write(data: string | Uint8Array, callback: () => void): void;
  dispose(): void;
}

interface EmulatorRequest {
  readonly id: number;
  readonly operation: "write" | "resize" | "snapshot" | "dispose";
  readonly data?: string | Uint8Array;
  readonly columns?: number;
  readonly rows?: number;
}

interface CapacityTerminalSnapshot {
  readonly activeBuffer: "normal" | "alternate";
  readonly lines: readonly string[];
  readonly scrollback: readonly string[];
  readonly cursor: { readonly visible: boolean };
}

const port = parentPort;
if (!port) throw new Error("capacity terminal emulator requires a worker parent port");
const dimensions = workerData as { readonly columns: number; readonly rows: number };
const terminal = new HeadlessTerminal({
  cols: dimensions.columns,
  rows: dimensions.rows,
  scrollback: 10_000,
  allowProposedApi: true,
  convertEol: true,
});
const unicode = new Unicode11Addon();
terminal.loadAddon(unicode);
terminal.unicode.activeVersion = "11";
let disposed = false;
let pending = Promise.resolve();

function write(data: string | Uint8Array): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve));
}

function snapshot(): CapacityTerminalSnapshot {
  const active = terminal.buffer.active;
  const normal = terminal.buffer.normal;
  const hidden = terminal._core?.coreService?.isCursorHidden;
  if (typeof hidden !== "boolean") {
    throw new Error("The terminal emulator does not expose cursor visibility");
  }
  const readLine = (line: BufferLine | undefined): string => line?.translateToString(false) ?? "";
  return Object.freeze({
    activeBuffer: active.type,
    lines: Object.freeze(
      Array.from({ length: terminal.rows }, (_, row) =>
        readLine(active.getLine(active.viewportY + row)),
      ),
    ),
    scrollback: Object.freeze(
      Array.from({ length: normal.viewportY }, (_, row) => readLine(normal.getLine(row))),
    ),
    cursor: Object.freeze({ visible: !hidden }),
  });
}

async function handle(message: EmulatorRequest): Promise<CapacityTerminalSnapshot | undefined> {
  if (disposed) throw new Error("The terminal emulator is disposed");
  switch (message.operation) {
    case "write":
      if (message.data === undefined) throw new Error("write requires data");
      await write(message.data);
      return undefined;
    case "resize":
      if (message.columns === undefined || message.rows === undefined) {
        throw new Error("resize requires columns and rows");
      }
      terminal.resize(message.columns, message.rows);
      return undefined;
    case "snapshot":
      return snapshot();
    case "dispose":
      disposed = true;
      unicode.dispose();
      terminal.dispose();
      return undefined;
  }
}

port.on("message", (message: EmulatorRequest) => {
  pending = pending
    .then(() => handle(message))
    .then(
      (result) => {
        port.postMessage({ id: message.id, result });
      },
      (error: unknown) => {
        port.postMessage({
          id: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );
});
