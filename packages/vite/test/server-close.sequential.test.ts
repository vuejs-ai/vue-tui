// SEQUENTIAL: process-global devtools session + live Vite server. Must not run
// concurrently with other files that claim a vue-tui session.
import { test, expect, afterEach } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import {
  disconnectDevtools,
  isDevConnected,
  getDevtoolsSessionId,
} from "@vue-tui/runtime/internal/devtools";
import { vueTui } from "../src/index.ts";
import { getActiveDevSessionId } from "../src/dev-session.ts";
import { capture, waitFor, waitUntil } from "./helpers.ts";

const root = fileURLToPath(new URL("./fixtures/basic", import.meta.url));
let server: ViteDevServer | undefined;

afterEach(async () => {
  await server?.close().catch(() => {});
  server = undefined;
  // Belt-and-suspenders for a failed claim path that never wrapped close.
  await disconnectDevtools();
  delete (globalThis as Record<string, unknown>).__VT_TEST_STDOUT__;
  delete (globalThis as Record<string, unknown>).__VT_TEST_APP__;
});

test("programmatic server.close() tears down the app and settles lifecycle", async () => {
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

  const app = (globalThis as { __VT_TEST_APP__?: { waitUntilExit(): Promise<void> } })
    .__VT_TEST_APP__;
  expect(app).toBeDefined();
  const exitOutcome = app!.waitUntilExit().then(
    () => "resolved" as const,
    () => "rejected" as const,
  );
  await server.close();
  server = undefined;

  // Allow microtasks from teardown to finish releasing listeners.
  await waitUntil(() => !isDevConnected());
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      exitOutcome,
      new Promise<"timeout">((resolve) => {
        timeout = setTimeout(() => resolve("timeout"), 500);
      }),
    ]);
    expect(outcome).toBe("resolved");
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  expect(isDevConnected()).toBe(false);
  expect(getDevtoolsSessionId()).toBeUndefined();
  expect(getActiveDevSessionId()).toBeUndefined();
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
