import { PassThrough } from "node:stream";

export function makeTtyOutput(columns = 20, rows = 4): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: true, columns, rows });
  return stream;
}

export function makeTtyInput(): NodeJS.ReadStream {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stream, {
    isTTY: true,
    setRawMode() {
      return stream;
    },
    setEncoding() {
      return stream;
    },
    ref() {},
    unref() {},
  });
  return stream;
}
