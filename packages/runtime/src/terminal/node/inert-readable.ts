import { Readable } from "node:stream";

/** Construct an inert stream for the synchronous string-rendering host. */
export function createInertReadable(): NodeJS.ReadStream {
  const stream = new Readable({ read() {} }) as NodeJS.ReadStream;
  Object.assign(stream, {
    isTTY: false,
    setRawMode() {
      return stream;
    },
  });
  return stream;
}
