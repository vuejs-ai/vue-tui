import { afterEach, expect, test } from "vite-plus/test";
import { connectDevtools, disconnectDevtools, isDevConnected, devState } from "./hmr.ts";

afterEach(() => disconnectDevtools());

function fakeHot() {
  const handlers = new Map<string, (p: unknown) => void>();
  return {
    on: (e: string, cb: (p: unknown) => void) => handlers.set(e, cb),
    send: () => {},
    emit: (e: string, p: unknown) => handlers.get(e)?.(p),
  };
}

test("connectDevtools marks dev connected and wires the bridge to the passed hot", () => {
  expect(isDevConnected()).toBe(false);
  const hot = fakeHot();
  connectDevtools(hot);
  expect(isDevConnected()).toBe(true);
  hot.emit("vite:error", { err: { message: "boom" } });
  expect(devState.value).toEqual({ type: "error", error: { message: "boom" } });
});

test("keeps an error visible until a later update actually finishes", () => {
  const hot = fakeHot();
  connectDevtools(hot);

  hot.emit("vue-tui:hmr-error-context", { timestamp: 1 });
  hot.emit("vite:error", { err: { message: "boom" } });
  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/app.vue", timestamp: 1 }],
  });
  expect(devState.value).toEqual({ type: "error", error: { message: "boom" } });

  hot.emit("vite:afterUpdate", undefined);
  expect(devState.value).toEqual({ type: "error", error: { message: "boom" } });

  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/app.vue", timestamp: 2 }],
  });
  hot.emit("vite:afterUpdate", undefined);
  expect(devState.value).toEqual({
    type: "update",
    paths: ["/src/app.vue"],
  });
});

test("ignores an older error that arrives after a newer update completed", () => {
  const hot = fakeHot();
  connectDevtools(hot);

  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/app.vue", timestamp: 202 }],
  });
  hot.emit("vite:afterUpdate", undefined);
  expect(devState.value).toEqual({
    type: "update",
    paths: ["/src/app.vue"],
  });

  hot.emit("vue-tui:hmr-error-context", { timestamp: 101 });
  hot.emit("vite:error", { err: { message: "stale failure" } });
  expect(devState.value).toEqual({
    type: "update",
    paths: ["/src/app.vue"],
  });

  hot.emit("vue-tui:hmr-error-context", { timestamp: 303 });
  hot.emit("vite:error", { err: { message: "new failure" } });
  expect(devState.value).toEqual({
    type: "error",
    error: { message: "new failure" },
  });

  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/older.vue", timestamp: 250 }],
  });
  hot.emit("vite:afterUpdate", undefined);
  expect(devState.value).toEqual({
    type: "error",
    error: { message: "new failure" },
  });

  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/fixed.vue", timestamp: 404 }],
  });
  hot.emit("vite:afterUpdate", undefined);
  expect(devState.value).toEqual({
    type: "update",
    paths: ["/src/fixed.vue"],
  });
});
