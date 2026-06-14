// SEQUENTIAL: initHmrBridge guards registration with a MODULE-LEVEL boolean.
// Each test re-imports the module via vi.resetModules() so the guard starts
// fresh; the module cache is process-global, so this must not run concurrently.
import { afterEach, expect, test, vi } from "vite-plus/test";

// Internal module not in package exports — import via relative source path,
// matching the convention in unit/animation-scheduler.sequential.test.ts. The
// dynamic import() path must be a string LITERAL so the bundler resolves it
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
  const { initHmrBridge } = await import("../../runtime/src/hmr.ts");
  const hot = makeFakeHot();

  // Simulate two createApp() calls in one dev process (two apps, or unmount +
  // re-create). Vite appends listeners without dedup, so without an idempotency
  // guard the second call would re-register all three handlers (6 total).
  initHmrBridge(hot);
  initHmrBridge(hot);

  // Exactly 3 = one each for vite:error, vite:beforeUpdate, vite:beforeFullReload.
  expect(hot.on).toHaveBeenCalledTimes(3);
});

test("a registered handler still works after the idempotency refactor", async () => {
  vi.resetModules();
  const { initHmrBridge, devState } = await import("../../runtime/src/hmr.ts");
  const hot = makeFakeHot();

  initHmrBridge(hot);

  // Firing vite:error must drive devState to an error — proves the refactor to
  // a parameterized `hot` kept the handler wiring intact.
  const errHandler = hot.handlers.get("vite:error");
  expect(errHandler).toBeTypeOf("function");
  errHandler!({ err: { message: "boom" } });
  expect(devState.value).toEqual({ type: "error", error: { message: "boom" } });

  // vite:beforeFullReload must send the reload request through the injected hot.
  const reloadHandler = hot.handlers.get("vite:beforeFullReload");
  expect(reloadHandler).toBeTypeOf("function");
  reloadHandler!(undefined);
  expect(hot.send).toHaveBeenCalledWith("vue-tui:request-reload");
});
