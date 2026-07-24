// SEQUENTIAL: process-global Runtime resource tracker + devtools session + live Vite
// server. Must not run concurrently with other files that claim a vue-tui session or
// mount apps into the same process-wide counters.
import { test, expect, afterEach } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import {
  disconnectDevtools,
  isDevConnected,
  getDevtoolsSessionId,
} from "@vue-tui/runtime/internal/devtools";
import { runtimeResourceTracker } from "../../runtime/src/resource-tracker.ts";
import { vueTui, getActiveDevSessionId } from "../src/index.ts";
import { capture, waitFor, waitUntil } from "./helpers.ts";

const root = fileURLToPath(new URL("./fixtures/basic", import.meta.url));
let server: ViteDevServer | undefined;

afterEach(async () => {
  await server?.close().catch(() => {});
  server = undefined;
  // Belt-and-suspenders for a failed claim path that never wrapped close.
  disconnectDevtools();
  delete (globalThis as Record<string, unknown>).__VT_TEST_STDOUT__;
});

function resourcesNonZero(snapshot: Record<string, number>): string[] {
  return Object.entries(snapshot)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}=${n}`);
}

test("programmatic server.close() tears down the app and releases Runtime resources", async () => {
  const before = runtimeResourceTracker.snapshot();
  const read = capture({ terminal: true });
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
  });
  await server.listen();
  await waitFor(read, "LABEL-A");

  expect(isDevConnected()).toBe(true);
  expect(getDevtoolsSessionId()).toBeTypeOf("string");
  expect(getActiveDevSessionId()).toBe(getDevtoolsSessionId());

  // While mounted, at least some tracked resources should be held (TTY path).
  const mid = runtimeResourceTracker.snapshot();
  expect(resourcesNonZero(mid).length).toBeGreaterThan(0);

  await server.close();
  server = undefined;

  // Allow microtasks from teardown to finish releasing listeners.
  await waitUntil(() => !isDevConnected());
  expect(isDevConnected()).toBe(false);
  expect(getDevtoolsSessionId()).toBeUndefined();
  expect(getActiveDevSessionId()).toBeUndefined();

  const after = runtimeResourceTracker.snapshot();
  expect(after).toEqual(before);
});

test("sequential Vite dev sessions work in one process after close", async () => {
  const read = capture({ terminal: true });

  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
  });
  await server.listen();
  await waitFor(read, "LABEL-A");
  const firstSession = getDevtoolsSessionId();
  expect(firstSession).toBeTypeOf("string");
  await server.close();
  server = undefined;
  await waitUntil(() => !isDevConnected());

  // Fresh capture buffer for the second session.
  const read2 = capture({ terminal: true });
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
  });
  await server.listen();
  await waitFor(read2, "LABEL-A");
  const secondSession = getDevtoolsSessionId();
  expect(secondSession).toBeTypeOf("string");
  expect(secondSession).not.toBe(firstSession);
  expect(isDevConnected()).toBe(true);
});

test("a concurrent second session fails without stealing the first", async () => {
  const read = capture({ terminal: true });
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
  });
  await server.listen();
  await waitFor(read, "LABEL-A");
  const firstSession = getDevtoolsSessionId();
  expect(firstSession).toBeTypeOf("string");

  let second: ViteDevServer | undefined;
  await expect(async () => {
    second = await createServer({
      root,
      logLevel: "silent",
      configFile: false,
      plugins: [vue(), vueTui()],
    });
    // configureServer runs on listen in some paths; force plugin setup
    await second.listen();
  }).rejects.toThrow(/only one Vite dev session/i);

  await second?.close().catch(() => {});

  // First session still owns the process.
  expect(getDevtoolsSessionId()).toBe(firstSession);
  expect(isDevConnected()).toBe(true);
  expect(getActiveDevSessionId()).toBe(firstSession);
  // Still rendering
  const before = read().length;
  await waitUntil(() => read().length > before || read().includes("count="));
  expect(read()).toContain("LABEL-A");
});
