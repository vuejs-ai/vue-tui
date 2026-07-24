import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  connectDevtools,
  disconnectDevtools,
  isDevConnected,
  getDevtoolsSessionId,
  hasPendingDevResetTimer,
  registerDevApp,
  unregisterDevApp,
  devState,
  initHmrBridge,
} from "./hmr.ts";

afterEach(() => {
  disconnectDevtools();
});

function fakeHot() {
  const handlers = new Map<string, (p: unknown) => void>();
  return {
    on: (e: string, cb: (p: unknown) => void) => {
      handlers.set(e, cb);
    },
    send: vi.fn(),
    handlers,
    emit: (e: string, p?: unknown) => handlers.get(e)?.(p),
  };
}

test("disconnect is identity-guarded and idempotent", () => {
  const hot = fakeHot();
  connectDevtools(hot, { sessionId: "a" });
  expect(isDevConnected()).toBe(true);
  expect(getDevtoolsSessionId()).toBe("a");

  // Wrong session must not clear the active one.
  disconnectDevtools("other");
  expect(isDevConnected()).toBe(true);
  expect(getDevtoolsSessionId()).toBe("a");

  disconnectDevtools("a");
  expect(isDevConnected()).toBe(false);
  expect(getDevtoolsSessionId()).toBeUndefined();

  // Second call is a no-op.
  disconnectDevtools("a");
  disconnectDevtools();
  expect(isDevConnected()).toBe(false);
});

test("pending dev-state timers do not survive disconnect", () => {
  vi.useFakeTimers();
  try {
    const hot = fakeHot();
    connectDevtools(hot, { sessionId: "timer" });
    hot.emit("vite:beforeUpdate", { updates: [{ path: "/x" }] });
    expect(devState.value.type).toBe("update");
    expect(hasPendingDevResetTimer()).toBe(true);

    disconnectDevtools("timer");
    expect(hasPendingDevResetTimer()).toBe(false);
    expect(isDevConnected()).toBe(false);

    // Advancing time must not resurrect update→ok after disconnect.
    vi.advanceTimersByTime(5000);
    expect(devState.value).toEqual({ type: "ok" });
  } finally {
    vi.useRealTimers();
  }
});

test("disconnect tears down the registered dev app once", () => {
  const hot = fakeHot();
  connectDevtools(hot, { sessionId: "app" });
  let teardowns = 0;
  const teardown = () => {
    teardowns += 1;
    unregisterDevApp(teardown);
  };
  registerDevApp(teardown);

  disconnectDevtools("app");
  expect(teardowns).toBe(1);
  disconnectDevtools("app");
  expect(teardowns).toBe(1);
});

test("concurrent session connect fails without overwriting the first", () => {
  const hotA = fakeHot();
  const hotB = fakeHot();
  connectDevtools(hotA, { sessionId: "s1" });
  expect(() => connectDevtools(hotB, { sessionId: "s2" })).toThrow(/already active/i);
  expect(getDevtoolsSessionId()).toBe("s1");
  expect(isDevConnected()).toBe(true);
});

test("same-session reconnect with a new hot (full reload) is allowed", () => {
  const hotA = fakeHot();
  const hotB = fakeHot();
  connectDevtools(hotA, { sessionId: "reload" });
  connectDevtools(hotB, { sessionId: "reload" });
  expect(getDevtoolsSessionId()).toBe("reload");
  // New hot is armed (beforeFullReload registered on B).
  hotB.emit("vite:beforeFullReload");
});

test("full reload no longer sends vue-tui:request-reload", () => {
  const hot = fakeHot();
  initHmrBridge(hot);
  hot.emit("vite:beforeFullReload");
  expect(hot.send).not.toHaveBeenCalled();
});
