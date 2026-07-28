import { afterEach, expect, test } from "vite-plus/test";
import {
  connectDevtools,
  disconnectDevtools,
  isDevConnected,
  devState,
  invalidateDevHmrUpdate,
  reportDevRenderError,
} from "../../src/hmr.ts";
import { setTestEventSink } from "../../src/test-events.ts";

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

test("reports the HMR lifecycle through the shared test event sink", () => {
  const events: Array<{ ev: string; data?: unknown }> = [];
  setTestEventSink((line) => events.push(JSON.parse(line)));
  const hot = fakeHot();
  connectDevtools(hot);

  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/app.vue?vue&type=template" }],
  });
  hot.emit("vite:afterUpdate", undefined);
  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/app.tsx" }],
  });
  hot.emit("vite:afterUpdate", undefined);
  hot.emit("vite:error", {
    err: { message: "compile failed", plugin: "vite:vue", phase: "compile" },
  });
  hot.emit("vite:error", {
    err: { message: "evaluation failed", phase: "evaluate" },
  });
  hot.emit("vite:error", {
    err: { message: "unclassified failure", plugin: "vite:vue" },
  });
  hot.emit("vite:beforeFullReload", undefined);

  expect(events.map(({ ev, data }) => ({ ev, data }))).toEqual([
    { ev: "hmr:update-received", data: undefined },
    { ev: "hmr:update-applied", data: undefined },
    { ev: "hmr:update-received", data: undefined },
    { ev: "hmr:update-applied", data: undefined },
    { ev: "hmr:error", data: { phase: "compile" } },
    { ev: "hmr:error", data: { phase: "evaluate" } },
    { ev: "hmr:error", data: undefined },
    { ev: "hmr:update-received", data: { kind: "full-reload" } },
  ]);
});

test("reports an applied event only for a successful non-stale update", () => {
  const events: Array<{ ev: string }> = [];
  setTestEventSink((line) => events.push(JSON.parse(line)));
  const hot = fakeHot();
  connectDevtools(hot);

  hot.emit("vue-tui:hmr-error-context", { timestamp: 10 });
  hot.emit("vite:error", {
    err: { message: "failed update", phase: "compile" },
  });
  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/failed.vue", timestamp: 10 }],
  });
  hot.emit("vite:afterUpdate", undefined);
  expect(events.filter(({ ev }) => ev === "hmr:update-applied")).toHaveLength(0);

  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/fixed.vue", timestamp: 30 }],
  });
  hot.emit("vite:afterUpdate", undefined);
  expect(events.filter(({ ev }) => ev === "hmr:update-applied")).toHaveLength(1);

  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/stale.vue", timestamp: 20 }],
  });
  hot.emit("vite:afterUpdate", undefined);
  expect(events.filter(({ ev }) => ev === "hmr:update-applied")).toHaveLength(1);
});

test("deduplicates the same build error within one watcher update", () => {
  const events: Array<{ ev: string }> = [];
  setTestEventSink((line) => events.push(JSON.parse(line)));
  const hot = fakeHot();
  connectDevtools(hot);

  hot.emit("vue-tui:hmr-error-context", { timestamp: 10 });
  hot.emit("vite:error", {
    err: { message: "same compiler failure", phase: "compile" },
  });
  hot.emit("vue-tui:hmr-error-context", { timestamp: 10 });
  hot.emit("vite:error", {
    err: { message: "same compiler failure", phase: "compile" },
  });
  expect(events.filter(({ ev }) => ev === "hmr:error")).toHaveLength(1);

  hot.emit("vue-tui:hmr-error-context", { timestamp: 20 });
  hot.emit("vite:error", {
    err: { message: "same compiler failure", phase: "compile" },
  });
  expect(events.filter(({ ev }) => ev === "hmr:error")).toHaveLength(2);
});

test("a render error wins over the update that triggered it and a later update recovers", () => {
  const hot = fakeHot();
  connectDevtools(hot);

  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/broken.vue", timestamp: 10 }],
  });
  reportDevRenderError(new Error("render failed"));
  hot.emit("vite:afterUpdate", undefined);
  expect(devState.value).toMatchObject({
    type: "error",
    error: { message: "render failed", phase: "render" },
  });

  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/fixed.vue", timestamp: 20 }],
  });
  hot.emit("vite:afterUpdate", undefined);
  expect(devState.value).toEqual({
    type: "update",
    paths: ["/src/fixed.vue"],
  });
});

test("a runner failure invalidates its update before the queued error payload arrives", () => {
  const events: Array<{ ev: string }> = [];
  setTestEventSink((line) => events.push(JSON.parse(line)));
  const hot = fakeHot();
  connectDevtools(hot);

  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/broken.tsx", timestamp: 10 }],
  });
  invalidateDevHmrUpdate();
  hot.emit("vite:afterUpdate", undefined);
  expect(events.filter(({ ev }) => ev === "hmr:update-applied")).toHaveLength(0);

  hot.emit("vite:error", {
    err: { message: "evaluation failed", phase: "evaluate" },
  });
  expect(devState.value).toMatchObject({
    type: "error",
    error: { message: "evaluation failed", phase: "evaluate" },
  });

  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/fixed.tsx", timestamp: 20 }],
  });
  hot.emit("vite:afterUpdate", undefined);
  expect(events.filter(({ ev }) => ev === "hmr:update-applied")).toHaveLength(1);
});

test("the same render error from a later update remains visible", () => {
  const hot = fakeHot();
  connectDevtools(hot);
  const error = new Error("still broken");

  reportDevRenderError(error);
  hot.emit("vite:beforeUpdate", {
    updates: [{ path: "/src/still-broken.vue", timestamp: 10 }],
  });
  reportDevRenderError(error);
  hot.emit("vite:afterUpdate", undefined);

  expect(devState.value).toMatchObject({
    type: "error",
    error: { message: "still broken", phase: "render" },
  });
});

test("deduplicates repeated reports of the current render error", () => {
  const events: Array<{ ev: string; data?: unknown }> = [];
  setTestEventSink((line) => events.push(JSON.parse(line)));
  connectDevtools(fakeHot());
  const error = new Error("repeated render failure");

  reportDevRenderError(error);
  reportDevRenderError(error);

  expect(events.map(({ ev, data }) => ({ ev, data }))).toEqual([
    { ev: "hmr:error", data: { phase: "render" } },
  ]);
});
