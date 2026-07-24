import { Writable } from "node:stream";

export interface SlowWriteAttempt {
  readonly chunk: string;
  readonly bytes: number;
  readonly returned: boolean;
  readonly beforeLength: number;
  readonly afterLength: number;
  readonly duringBlockedEpoch: boolean;
}

export interface SlowWritable {
  readonly stream: NodeJS.WriteStream;
  readonly attempts: readonly SlowWriteAttempt[];
  readonly falseAttempts: readonly SlowWriteAttempt[];
  readonly writesBeforeDrain: readonly SlowWriteAttempt[];
  readonly drainCount: number;
  readonly deliveredOutput: string;
  readonly largestAtomicWrite: number;
  readonly maxWritableLength: number;
  waitForIdle(): Promise<void>;
}

export function createSlowWritable(
  options: {
    readonly highWaterMark?: number;
    readonly firstDelayMs?: number;
    readonly laterDelayMs?: number;
  } = {},
): SlowWritable {
  const attempts: SlowWriteAttempt[] = [];
  const falseAttempts: SlowWriteAttempt[] = [];
  const writesBeforeDrain: SlowWriteAttempt[] = [];
  const delivered: string[] = [];
  let firstCallback = true;
  let blocked = false;
  let drainCount = 0;
  let largestAtomicWrite = 0;
  let maxWritableLength = 0;

  const writable = new Writable({
    highWaterMark: options.highWaterMark ?? 256,
    write(chunk: Buffer, _encoding, callback) {
      const delay = firstCallback ? (options.firstDelayMs ?? 200) : (options.laterDelayMs ?? 20);
      firstCallback = false;
      setTimeout(() => {
        delivered.push(chunk.toString());
        callback();
      }, delay);
    },
  }) as unknown as NodeJS.WriteStream;
  Object.assign(writable, { columns: 100, rows: 30, isTTY: true });

  const originalWrite = writable.write.bind(writable);
  writable.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
    const beforeLength = writable.writableLength;
    const duringBlockedEpoch = blocked;
    const returned = (originalWrite as (...writeArgs: unknown[]) => boolean)(chunk, ...args);
    const bytes = Buffer.byteLength(chunk);
    const attempt: SlowWriteAttempt = Object.freeze({
      chunk: String(chunk),
      bytes,
      returned,
      beforeLength,
      afterLength: writable.writableLength,
      duringBlockedEpoch,
    });
    attempts.push(attempt);
    if (!returned) {
      blocked = true;
      falseAttempts.push(attempt);
    }
    if (duringBlockedEpoch) writesBeforeDrain.push(attempt);
    largestAtomicWrite = Math.max(largestAtomicWrite, bytes);
    maxWritableLength = Math.max(maxWritableLength, writable.writableLength);
    return returned;
  }) as NodeJS.WriteStream["write"];

  writable.on("drain", () => {
    blocked = false;
    drainCount++;
  });

  return {
    stream: writable,
    attempts,
    falseAttempts,
    writesBeforeDrain,
    get drainCount() {
      return drainCount;
    },
    get deliveredOutput() {
      return delivered.join("");
    },
    get largestAtomicWrite() {
      return largestAtomicWrite;
    },
    get maxWritableLength() {
      return maxWritableLength;
    },
    async waitForIdle() {
      const deadline = Date.now() + 5_000;
      while (writable.writableLength > 0 || writable.writableNeedDrain) {
        if (Date.now() >= deadline) throw new Error("Slow writable did not become idle.");
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
  };
}
