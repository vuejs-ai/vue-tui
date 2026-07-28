import { PassThrough, Writable } from "node:stream";
import { bsu, esu } from "../../../../packages/runtime/dist/internal.mjs";
import { nextLineEscape } from "../../../../packages/runtime/dist/internal.mjs";

export interface FakeWritableOptions {
  columns?: number;
  rows?: number;
}

export function makeFakeWritable(options: FakeWritableOptions = {}): NodeJS.WriteStream {
  const s = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(s, {
    columns: options.columns ?? 100,
    rows: options.rows ?? 100,
    isTTY: true,
  });
  return s;
}

export function makeFakeStdin(): { stream: NodeJS.ReadStream } {
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    setRawMode(this: NodeJS.ReadStream) {
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
    ref() {
      return s;
    },
    unref() {
      return s;
    },
  });
  return { stream: s };
}

export function makeTtyWritable(): NodeJS.WriteStream & { chunks: string[] } {
  const stream = makeFakeWritable({ columns: 80, rows: 24 }) as NodeJS.WriteStream & {
    chunks: string[];
  };
  stream.chunks = [];
  stream.on("data", (chunk: Buffer) => stream.chunks.push(chunk.toString()));
  return stream;
}

export function makeRawTrackingStdin(initialRaw = false): {
  stream: NodeJS.ReadStream & { isRaw: boolean };
  calls: boolean[];
} {
  const calls: boolean[] = [];
  const stream = new PassThrough() as unknown as NodeJS.ReadStream & { isRaw: boolean };
  Object.assign(stream, {
    isTTY: true,
    isRaw: initialRaw,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, mode: boolean) {
      calls.push(mode);
      this.isRaw = mode;
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
    ref() {},
    unref() {},
  });
  return { stream, calls };
}

export function createDelayedWriteCallbackStdout({
  shouldDelay,
  onDelayElapsed,
  delayMs = 150,
}: {
  shouldDelay: (chunk: string | Uint8Array) => boolean;
  onDelayElapsed: () => void;
  delayMs?: number;
}): NodeJS.WriteStream {
  let didDelayOnce = false;

  const stdout = new Writable({
    write(
      chunk: string | Uint8Array,
      _encoding: BufferEncoding,
      callback: (error?: Error) => void,
    ) {
      if (!didDelayOnce && shouldDelay(chunk)) {
        didDelayOnce = true;
        setTimeout(() => {
          onDelayElapsed();
          callback();
        }, delayMs);
        return;
      }
      callback();
    },
  }) as unknown as NodeJS.WriteStream;

  stdout.columns = 100;
  stdout.rows = 100;
  stdout.isTTY = true;
  return stdout;
}

export const isWriteBarrierChunk = (chunk: string | Uint8Array): boolean =>
  (typeof chunk === "string" && chunk === "") ||
  (chunk instanceof Uint8Array && chunk.length === 0);

export function captureWrites(stdout: NodeJS.WriteStream): string[] {
  const writes: string[] = [];
  const original = stdout.write.bind(stdout) as (
    data: string | Uint8Array,
    ...rest: unknown[]
  ) => boolean;
  stdout.write = ((data: string | Uint8Array, ...rest: unknown[]) => {
    writes.push(String(data));
    return original(data, ...rest);
  }) as NodeJS.WriteStream["write"];
  return writes;
}

export function getContentWrites(writes: string[]): string[] {
  return writes
    .map((write) =>
      write
        .replaceAll(bsu, "")
        .replaceAll(esu, "")
        .replaceAll("\x1b[?25l", "")
        .replaceAll("\x1b[?25h", ""),
    )
    .filter((write) => write !== "" && write !== nextLineEscape);
}
