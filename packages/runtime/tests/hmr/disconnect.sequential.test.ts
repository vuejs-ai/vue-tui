// SEQUENTIAL: fake timers and the devtools bridge both mutate process-global state.
import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  connectDevtools,
  disconnectDevtools,
  isDevConnected,
  getDevtoolsSessionId,
  hasPendingDevResetTimer,
  invalidateDevHmrUpdate,
  isVueTuiDevSessionConflictError,
  registerDevApp,
  unregisterDevApp,
  VueTuiDevSessionConflictError,
  devState,
  initHmrBridge,
} from "../../src/hmr.ts";

afterEach(() => disconnectDevtools());

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

test("disconnect is identity-guarded and idempotent", async () => {
  const hot = fakeHot();
  connectDevtools(hot, { sessionId: "a" });
  expect(isDevConnected()).toBe(true);
  expect(getDevtoolsSessionId()).toBe("a");

  // Wrong session must not clear the active one.
  await disconnectDevtools("other");
  expect(isDevConnected()).toBe(true);
  expect(getDevtoolsSessionId()).toBe("a");

  await disconnectDevtools("a");
  expect(isDevConnected()).toBe(false);
  expect(getDevtoolsSessionId()).toBeUndefined();

  // Second call is a no-op.
  await disconnectDevtools("a");
  await disconnectDevtools();
  expect(isDevConnected()).toBe(false);
});

test("pending dev-state timers do not survive disconnect", async () => {
  vi.useFakeTimers();
  try {
    const hot = fakeHot();
    connectDevtools(hot, { sessionId: "timer" });
    hot.emit("vite:beforeUpdate", { updates: [{ path: "/x" }] });
    hot.emit("vite:afterUpdate");
    expect(devState.value.type).toBe("update");
    expect(hasPendingDevResetTimer()).toBe(true);

    await disconnectDevtools("timer");
    expect(hasPendingDevResetTimer()).toBe(false);
    expect(isDevConnected()).toBe(false);

    // Advancing time must not resurrect update→ok after disconnect.
    vi.advanceTimersByTime(5000);
    expect(devState.value).toEqual({ type: "ok" });
  } finally {
    vi.useRealTimers();
  }
});

test("a queued runner error cannot cross a disconnected session boundary", async () => {
  const firstHot = fakeHot();
  connectDevtools(firstHot, { sessionId: "first" });
  firstHot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/broken.tsx", timestamp: 10 }],
  });
  invalidateDevHmrUpdate();
  firstHot.emit("vite:afterUpdate");

  await disconnectDevtools("first");
  const secondHot = fakeHot();
  connectDevtools(secondHot, { sessionId: "second" });

  // The runner reports its error after afterUpdate. If that queued payload only
  // arrives after disconnect, the retired hot context must not poison the next
  // session's process-global overlay state.
  firstHot.emit("vue-tui:hmr-error-context", { timestamp: 10 });
  firstHot.emit("vite:error", {
    err: { message: "late evaluation failure", phase: "evaluate" },
  });
  expect(devState.value).toEqual({ type: "ok" });

  secondHot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/fixed.tsx", timestamp: 20 }],
  });
  secondHot.emit("vite:afterUpdate");
  expect(devState.value).toEqual({
    type: "update",
    paths: ["/src/fixed.tsx"],
  });
});

test("disconnect tears down the registered dev app once", async () => {
  const hot = fakeHot();
  connectDevtools(hot, { sessionId: "app" });
  let teardowns = 0;
  const app = {
    replace() {},
    close() {
      teardowns += 1;
      unregisterDevApp(app);
    },
  };
  registerDevApp(app);

  await disconnectDevtools("app");
  expect(teardowns).toBe(1);
  await disconnectDevtools("app");
  expect(teardowns).toBe(1);
});

test("a second mounted dev app is rejected instead of replacing the first", () => {
  const first = { replace: vi.fn(), close: vi.fn() };
  const second = { replace: vi.fn(), close: vi.fn() };
  registerDevApp(first);
  try {
    expect(() => registerDevApp(second)).toThrow(/one mounted app/i);
  } finally {
    unregisterDevApp(first);
  }
});

test("concurrent session connect fails without overwriting the first", async () => {
  const hotA = fakeHot();
  const hotB = fakeHot();
  connectDevtools(hotA, { sessionId: "s1" });
  let conflict: unknown;
  try {
    connectDevtools(hotB, { sessionId: "s2" });
  } catch (error) {
    conflict = error;
  }
  expect(conflict).toBeInstanceOf(VueTuiDevSessionConflictError);
  expect(isVueTuiDevSessionConflictError(conflict)).toBe(true);
  expect(
    isVueTuiDevSessionConflictError(
      Object.assign(new Error("user error"), { name: "VueTuiDevSessionConflictError" }),
    ),
  ).toBe(false);
  const hostile = new Proxy(new Error("user error"), {
    get(target, property, receiver) {
      if (typeof property === "symbol") throw new Error("getter exploded");
      return Reflect.get(target, property, receiver);
    },
  });
  expect(() => isVueTuiDevSessionConflictError(hostile)).not.toThrow();
  expect(isVueTuiDevSessionConflictError(hostile)).toBe(false);
  const copyUrl = new URL("../../src/hmr.ts", import.meta.url);
  copyUrl.searchParams.set("copy", "session-conflict");
  const copy = (await import(copyUrl.href)) as typeof import("../../src/hmr.ts");
  const crossCopyConflict = new copy.VueTuiDevSessionConflictError();
  expect(crossCopyConflict).not.toBeInstanceOf(VueTuiDevSessionConflictError);
  expect(isVueTuiDevSessionConflictError(crossCopyConflict)).toBe(true);
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
