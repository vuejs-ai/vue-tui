import { PassThrough } from "node:stream";

export function captureStream(stream: NodeJS.WriteStream): { readonly chunks: string[] } {
  const chunks: string[] = [];
  (stream as unknown as PassThrough).on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });
  return { chunks };
}

export function makeWritable(options: {
  readonly isTTY: boolean;
  readonly columns?: number;
  readonly rows?: number;
}): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, {
    isTTY: options.isTTY,
    columns: options.columns ?? 80,
    rows: options.rows,
  });
  return stream;
}

export async function waitFor(predicate: () => boolean, description: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}
