import { PassThrough } from "node:stream";

type FakeWritableStream = PassThrough & NodeJS.WriteStream;

export interface FakeWritableOptions {
  columns?: number;
  rows?: number;
  isTTY?: boolean;
}

export function makeFakeWritable(options: FakeWritableOptions = {}): FakeWritableStream {
  const s = new PassThrough() as FakeWritableStream;
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
  // PassThrough supplies the real stream behavior; the test host installs the
  // TTY-only ReadStream surface immediately below.
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
    ref() {
      return s;
    },
    unref() {
      return s;
    },
  });
  return { stream: s, rawMode };
}
