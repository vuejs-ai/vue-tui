// Shared seams for the sequential @vue-tui/vite dev-server tests. Each of those boots a live
// in-process Vite dev server and reads rendered frames back through the process-global
// __VT_TEST_STDOUT__ sink — see each test file's SEQUENTIAL header for why they can't run
// concurrently. This file is not a test (no .test/.spec suffix), just their shared toolkit.

// Install the process-global frame sink and return a reader for the accumulated output.
// Only `write` + `isTTY:false` are needed: a non-TTY stdout selects final-stream
// output (no cursor moves, ANSI erases, or resize listener), so the mock can be a
// minimal sink that just accumulates the emitted frames.
export function capture(): () => string {
  let buf = "";
  (globalThis as Record<string, unknown>).__VT_TEST_STDOUT__ = {
    write: (s: string) => ((buf += s), true),
    isTTY: false,
  };
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
