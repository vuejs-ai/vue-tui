import { PassThrough } from "node:stream";

export interface FakeWritableOptions {
  columns?: number;
  rows?: number;
  isTTY?: boolean;
}

export function makeFakeWritable(options: FakeWritableOptions = {}): NodeJS.WriteStream {
  const s = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(s, {
    columns: options.columns ?? 100,
    isTTY: options.isTTY ?? true,
  });
  if (options.rows !== undefined) Object.assign(s, { rows: options.rows });
  return s;
}

export interface RawModeState {
  readonly current: boolean;
  readonly history: readonly boolean[];
}

export function makeFakeStdin(options: { isTTY?: boolean } = {}): {
  stream: NodeJS.ReadStream;
  rawMode: RawModeState;
} {
  const rawMode = { current: false, history: [] as boolean[] };
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: options.isTTY ?? true,
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, mode: boolean) {
      this.isRaw = mode;
      rawMode.current = mode;
      (rawMode.history as boolean[]).push(mode);
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
  });
  (s as any).ref = () => {};
  (s as any).unref = () => {};
  return { stream: s, rawMode };
}
