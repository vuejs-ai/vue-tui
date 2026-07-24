// SEQUENTIAL: `devState` and the `initialized` guard are MODULE-GLOBALS in
// hmr.ts. Each test re-imports the module via vi.resetModules() so the globals
// start fresh; the module cache is process-global, so this must not run
// concurrently. Mirrors unit/hmr-bridge-idempotent.sequential.test.ts.
import { afterEach, expect, test, vi } from "vite-plus/test";

// Internal module not in package exports — import via relative source path. The
// dynamic import() path must be a string LITERAL so the bundler resolves it
// relative to this file. (overlay.ts is NOT imported here: it pulls in .vue SFCs
// the unit-test pipeline can't transform. resetDevState lives in hmr.ts, and
// render()'s dev block calls it — see render.ts's isDevConnected() gate.)

type FakeHot = {
  on: ReturnType<typeof vi.fn<(event: string, cb: (payload: unknown) => void) => void>>;
  send: ReturnType<typeof vi.fn<(event: string, data?: unknown) => void>>;
  handlers: Map<string, (payload: unknown) => void>;
};

function makeFakeHot(): FakeHot {
  const handlers = new Map<string, (payload: unknown) => void>();
  const on = vi.fn((event: string, cb: (payload: unknown) => void) => {
    handlers.set(event, cb);
  });
  const send = vi.fn<(event: string, data?: unknown) => void>();
  return { on, send, handlers };
}

afterEach(() => {
  vi.resetModules();
});

test("a fresh dev app does not inherit a previous app's Build Error", async () => {
  vi.resetModules();
  const { initHmrBridge, devState, resetDevState } = await import("../../runtime/src/hmr.ts");
  const hot = makeFakeHot();
  initHmrBridge(hot);

  // App A hits a build error (real vite:error handler drives the module-global).
  hot.handlers.get("vite:error")!({ err: { message: "old build error" } });
  // vite:error applies on a microtask so a same-turn beforeUpdate cannot clobber it.
  await Promise.resolve();
  expect(devState.value).toEqual({ type: "error", error: { message: "old build error" } });

  // App A unmounts; App B mounts. Nothing reset devState before this fix, so App
  // B's DevOverlay injected the stale {type:"error"} and rendered the old "Build
  // Error" frame instead of its own content. render()'s dev block now calls
  // resetDevState() when setting up each new app, so App B starts clean.
  resetDevState();
  expect(devState.value).toEqual({ type: "ok" });
});

test("a fresh dev app does not inherit a previous app's transient HMR update status", async () => {
  vi.useFakeTimers();
  try {
    vi.resetModules();
    const { initHmrBridge, devState, resetDevState } = await import("../../runtime/src/hmr.ts");
    const hot = makeFakeHot();
    initHmrBridge(hot);

    // App A had a pending "[HMR] updated: …" status line.
    hot.handlers.get("vite:beforeUpdate")!({ updates: [{ path: "/src/old.vue" }] });
    expect(devState.value).toEqual({ type: "update", paths: ["/src/old.vue"] });

    // App B mounts → reset → clean status, regardless of the still-pending timer.
    resetDevState();
    expect(devState.value).toEqual({ type: "ok" });

    // And the previous app's pending reset timer firing later must not clobber
    // App B's now-clean status (it only acts while type === "update").
    vi.advanceTimersByTime(2000);
    expect(devState.value).toEqual({ type: "ok" });
  } finally {
    vi.useRealTimers();
  }
});
