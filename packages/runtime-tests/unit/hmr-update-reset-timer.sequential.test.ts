// SEQUENTIAL: this file uses vi.useFakeTimers(), which MUTATES the process-global
// setTimeout/clearTimeout. It also relies on initHmrBridge's MODULE-LEVEL state
// (the `initialized` guard and the `resetTimer` handle), reset per test via
// vi.resetModules() — both are process-global, so this must not run concurrently.
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

// Internal module not in package exports — import via relative source path,
// matching unit/hmr-bridge-idempotent.sequential.test.ts. The dynamic import()
// path must be a string LITERAL so the bundler resolves it relative to this file.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

// `on`/`send` typed with their real signatures so FakeHot structurally satisfies
// initHmrBridge's HotContext param; `handlers` is test-only state for firing back.
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

test("rapid saves: the LAST update's full 2000ms window is honored, not collapsed by an earlier update's timer", async () => {
  vi.resetModules();
  const { initHmrBridge, devState } = await import("../../runtime/src/hmr.ts");
  const hot = makeFakeHot();
  initHmrBridge(hot);

  const fire = hot.handlers.get("vite:beforeUpdate");
  expect(fire).toBeTypeOf("function");

  // t=0: update A. Schedules a reset for t=2000.
  fire!({ updates: [{ path: "a.vue" }] });
  expect(devState.value).toEqual({ type: "update", paths: ["a.vue"] });

  // t=1500: update B arrives before A's window closes. B's window runs to t=3500.
  vi.advanceTimersByTime(1500);
  fire!({ updates: [{ path: "b.vue" }] });
  expect(devState.value).toEqual({ type: "update", paths: ["b.vue"] });

  // t=2000: A's original timer would fire here. With the fix it was cleared, so
  // B's status line MUST still be showing (its window doesn't close until t=3500).
  vi.advanceTimersByTime(500);
  expect(devState.value).toEqual({ type: "update", paths: ["b.vue"] });

  // t=3500: B's full window has now elapsed → reset to ok.
  vi.advanceTimersByTime(1500);
  expect(devState.value).toEqual({ type: "ok" });
});

test("single update: resets to ok after exactly 2000ms (unchanged baseline)", async () => {
  vi.resetModules();
  const { initHmrBridge, devState } = await import("../../runtime/src/hmr.ts");
  const hot = makeFakeHot();
  initHmrBridge(hot);

  const fire = hot.handlers.get("vite:beforeUpdate");
  fire!({ updates: [{ path: "a.vue" }] });
  expect(devState.value).toEqual({ type: "update", paths: ["a.vue"] });

  // Just shy of the window: still showing.
  vi.advanceTimersByTime(1999);
  expect(devState.value).toEqual({ type: "update", paths: ["a.vue"] });

  // Window elapsed: reset to ok.
  vi.advanceTimersByTime(1);
  expect(devState.value).toEqual({ type: "ok" });
});

test("an error after an update is NOT clobbered back to ok by the pending update timer", async () => {
  vi.resetModules();
  const { initHmrBridge, devState } = await import("../../runtime/src/hmr.ts");
  const hot = makeFakeHot();
  initHmrBridge(hot);

  const fireUpdate = hot.handlers.get("vite:beforeUpdate");
  const fireError = hot.handlers.get("vite:error");
  expect(fireError).toBeTypeOf("function");

  // Update schedules a reset, then an error arrives before the window closes.
  fireUpdate!({ updates: [{ path: "a.vue" }] });
  fireError!({ err: { message: "boom" } });
  expect(devState.value).toEqual({ type: "error", error: { message: "boom" } });

  // The pending update timer must no-op (devState is no longer "update"), leaving
  // the error state intact — the `type === "update"` guard is preserved.
  vi.advanceTimersByTime(2000);
  expect(devState.value).toEqual({ type: "error", error: { message: "boom" } });
});
