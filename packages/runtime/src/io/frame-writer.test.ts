import { PassThrough } from "node:stream";
import { expect, test } from "vite-plus/test";
import { createFrameWriter } from "./frame-writer.ts";

test("debug mode writes complete frames terminated by newline", () => {
  const writes: string[] = [];
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { columns: 80, rows: 24, isTTY: true });
  stream.on("data", (chunk) => writes.push(chunk.toString()));

  const writer = createFrameWriter(stream, { debug: true });
  writer.write("hello");
  writer.write("hello"); // identical frame skipped
  writer.write("world");

  expect(writes).toEqual(["hello\n", "world\n"]);
});
