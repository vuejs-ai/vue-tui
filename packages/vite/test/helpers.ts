// Shared seams for the sequential @vue-tui/vite dev-server tests. Each of those boots a live
// in-process Vite dev server and reads rendered frames back through the process-global
// __VT_TEST_STDOUT__ sink — see each test file's SEQUENTIAL header for why they can't run
// concurrently. This file is not a test (no .test/.spec suffix), just their shared toolkit.

// Install the process-global output stream and return a reader for the accumulated output.
// Most fixtures need only a stream destination. A terminal destination is opt-in
// for behavior whose availability depends on terminal output, such as a caret.
export function capture(options: { readonly terminal?: boolean } = {}): () => string {
  let buf = "";
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(
    stream,
    options.terminal ? { isTTY: true, columns: 80, rows: 24 } : { isTTY: false },
  );
  stream.on("data", (chunk) => {
    buf += String(chunk);
  });
  (globalThis as Record<string, unknown>).__VT_TEST_STDOUT__ = stream;
  return () => buf;
}

// Poll `cond` every 30ms until it returns true, or throw after `ms`.
export async function waitUntil(cond: () => boolean, ms = 8000): Promise<void> {
  const start = performance.now();
  while (performance.now() - start < ms) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("timeout");
}

// Like waitUntil, but waits for `needle` to appear in `read()` and, on timeout, reports the
// tail of the captured output — the usual "what did we actually render?" debugging need.
export async function waitFor(read: () => string, needle: string, ms = 8000): Promise<void> {
  const start = performance.now();
  while (performance.now() - start < ms) {
    if (read().includes(needle)) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`timeout waiting for ${JSON.stringify(needle)}; got:\n${read().slice(-400)}`);
}
import { PassThrough } from "node:stream";
