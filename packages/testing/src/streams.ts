import { PassThrough } from "node:stream";

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

export interface RawModeState {
  readonly current: boolean;
  readonly history: readonly boolean[];
}

export function makeFakeStdin(): { stream: NodeJS.ReadStream; rawMode: RawModeState } {
  const rawMode = { current: false, history: [] as boolean[] };
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    setRawMode(this: NodeJS.ReadStream, mode: boolean) {
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
