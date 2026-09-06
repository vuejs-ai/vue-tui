// SEQUENTIAL: initHmrBridge guards registration with a module-level HOT-IDENTITY guard
// (re-arms each new hot, skips a repeat of the same hot). Each test re-imports the module via
// vi.resetModules() so the guard starts fresh; the module cache is process-global, so this
// must not run concurrently.
import { afterEach, expect, test, vi } from "vite-plus/test";

// The dynamic import() path must be a string LITERAL so the bundler resolves it
// relative to this file (a variable path resolves against the project root).

afterEach(() => {
  vi.resetModules();
});

// `on`/`send` are typed with their real signatures so FakeHot structurally
// satisfies the HotContext param of initHmrBridge (vi.fn's default loose
// signature would not). `handlers` is test-only state for firing callbacks back.
type FakeHot = {
  on: ReturnType<typeof vi.fn<(event: string, cb: (payload: unknown) => void) => void>>;
  send: ReturnType<typeof vi.fn<(event: string, data?: unknown) => void>>;
  handlers: Map<string, (payload: unknown) => void>;
};

function makeFakeHot(): FakeHot {
  const handlers = new Map<string, (payload: unknown) => void>();
  const on = vi.fn((event: string, cb: (payload: unknown) => void) => {
    // Mirror Vite's APPEND-without-dedup semantics: last registration wins in
    // this map, but `on` is still *called* once per registration so the spy
    // count reflects accumulation exactly as the real runtime would leak it.
    handlers.set(event, cb);
  });
  const send = vi.fn<(event: string, data?: unknown) => void>();
  return { on, send, handlers };
}

test("initHmrBridge registers each listener AT MOST ONCE across repeated createApp() calls", async () => {
  vi.resetModules();
  const { initHmrBridge } = await import("../../../src/dev/hmr.ts");
  const hot = makeFakeHot();

  // Simulate two createApp() calls in one dev process (two apps, or unmount +
  // re-create). Vite appends listeners without dedup, so without an idempotency
  // guard the second call would re-register all five handlers (10 total).
  initHmrBridge(hot);
  initHmrBridge(hot);

  // Error context, error, before/after update, and full reload are each registered once.
  expect(hot.on).toHaveBeenCalledTimes(5);
});

test("initHmrBridge RE-ARMS each new hot (a full reload hands the runtime a fresh hot)", async () => {
  vi.resetModules();
  const { initHmrBridge } = await import("../../../src/dev/hmr.ts");
  const hotA = makeFakeHot();
  const hotB = makeFakeHot();

  // Boot connects hotA; a full reload re-executes the injected dev module with a NEW hot.
  // A per-PROCESS boolean guard would skip hotB entirely (the bridge dies after the first
  // reload on externalized/published installs, where module-globals persist); the hot-identity
  // guard must re-register on each new hot.
  initHmrBridge(hotA);
  initHmrBridge(hotB);

  expect(hotA.on).toHaveBeenCalledTimes(5);
  expect(hotB.on).toHaveBeenCalledTimes(5); // re-armed on the fresh hot
});

test("registered handlers update state and handle full reload", async () => {
  vi.resetModules();
  const { initHmrBridge, devState } = await import("../../../src/dev/hmr.ts");
  const hot = makeFakeHot();

  initHmrBridge(hot);

  const errHandler = hot.handlers.get("vite:error");
  expect(errHandler).toBeTypeOf("function");
  errHandler!({ err: { message: "boom" } });
  // Error applies on a microtask so a same-turn beforeUpdate cannot clobber it.
  await Promise.resolve();
  expect(devState.value).toEqual({ type: "error", error: { message: "boom" } });

  const reloadHandler = hot.handlers.get("vite:beforeFullReload");
  expect(reloadHandler).toBeTypeOf("function");
  reloadHandler!(undefined);
});
