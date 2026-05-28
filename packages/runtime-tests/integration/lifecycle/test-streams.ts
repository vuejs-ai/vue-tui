import { PassThrough, Writable } from "node:stream";

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
  });
  (s as any).ref = () => {};
  (s as any).unref = () => {};
  return { stream: s };
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
  stdout.isTTY = true;
  return stdout;
}

export const isWriteBarrierChunk = (chunk: string | Uint8Array): boolean =>
  (typeof chunk === "string" && chunk === "") ||
  (chunk instanceof Uint8Array && chunk.length === 0);

export function captureWrites(stdout: NodeJS.WriteStream): string[] {
  const writes: string[] = [];
  const original = stdout.write.bind(stdout);
  stdout.write = ((...args: unknown[]) => {
    writes.push(String(args[0]));
    return (original as Function)(...args);
  }) as NodeJS.WriteStream["write"];
  return writes;
}

export function getContentWrites(writes: string[]): string[] {
  return writes.filter(
    (w) => w !== "" && !w.startsWith("\x1b[?25") && w !== "\x1b[?2026h" && w !== "\x1b[?2026l",
  );
}
