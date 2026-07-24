// SEQUENTIAL: this test uses vi.useFakeTimers(), which mutates the process-global
// setTimeout/clearTimeout. File-level parallelism could perturb other tests'
// timer assertions, so it must run in a *.sequential.test.* file. It also
// re-imports hmr.ts via vi.resetModules() to reset the module-level
// idempotency guard + pending-timer state between cases (the module cache is
// process-global), matching unit/hmr-bridge-idempotent.sequential.test.ts.
import { afterEach, expect, test, vi } from "vite-plus/test";

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

// `on`/`send` are typed with their real signatures so FakeHot structurally
// satisfies the HotContext param of initHmrBridge. `handlers` is test-only
// state for firing the registered callbacks back.
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

function updatePayload(paths: string[]): { updates: Array<{ path: string }> } {
  return { updates: paths.map((path) => ({ path })) };
}

test("a stale update timer does not reset a newer update's status early", async () => {
  vi.resetModules();
  const { initHmrBridge, devState } = await import("../../runtime/src/hmr.ts");
  const hot = makeFakeHot();

  vi.useFakeTimers();
  try {
    initHmrBridge(hot);
    const beforeUpdate = hot.handlers.get("vite:beforeUpdate");
    expect(beforeUpdate).toBeTypeOf("function");

    // t=0: update #1 schedules a reset for t=2000.
    beforeUpdate!(updatePayload(["a"]));
    expect(devState.value).toEqual({ type: "update", paths: ["a"] });

    // t=1500: update #2 schedules a reset for t=3500. The bug: update #1's
    // timer is still live and will fire at t=2000.
    vi.advanceTimersByTime(1500);
    beforeUpdate!(updatePayload(["b"]));
    expect(devState.value).toEqual({ type: "update", paths: ["b"] });

    // t=2000: update #1's stale timer fires. With the bug it sees type==="update"
    // (now update #2) and resets to "ok", clearing update #2's status 1500ms early.
    // After the fix update #1's timer was cleared, so the status must persist.
    vi.advanceTimersByTime(500);
    expect(devState.value).toEqual({ type: "update", paths: ["b"] });

    // t=3500: update #2's own timer fires and resets to "ok".
    vi.advanceTimersByTime(1500);
    expect(devState.value).toEqual({ type: "ok" });
  } finally {
    vi.useRealTimers();
  }
});

test("vite:error clears a pending update→ok reset so the error status persists", async () => {
  vi.resetModules();
  const { initHmrBridge, devState } = await import("../../runtime/src/hmr.ts");
  const hot = makeFakeHot();

  vi.useFakeTimers();
  try {
    initHmrBridge(hot);
    const beforeUpdate = hot.handlers.get("vite:beforeUpdate");
    const onError = hot.handlers.get("vite:error");
    expect(beforeUpdate).toBeTypeOf("function");
    expect(onError).toBeTypeOf("function");

    // An update schedules a reset for t=2000...
    beforeUpdate!(updatePayload(["a"]));
    expect(devState.value).toEqual({ type: "update", paths: ["a"] });

    // ...but an error supersedes it. The pending reset must be cleared so it can't
    // later overwrite the error status with "ok".
    onError!({ err: { message: "boom" } });
    // vite:error applies on a microtask so a same-turn beforeUpdate cannot clobber it.
    await Promise.resolve();
    expect(devState.value).toEqual({ type: "error", error: { message: "boom" } });

    vi.advanceTimersByTime(2000);
    expect(devState.value).toEqual({ type: "error", error: { message: "boom" } });
  } finally {
    vi.useRealTimers();
  }
});
