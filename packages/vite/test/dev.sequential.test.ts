// SEQUENTIAL: mutates globalThis.__VT_TEST_STDOUT__ (a process-global frame capture
// seam) and starts a live Vite dev server that binds OS ports. Running these tests
// concurrently with other files would race on the global and risk port conflicts.
// Frames are captured via globalThis.__VT_TEST_STDOUT__.
//
// NOTE: We pass configFile: false and provide vueTui() plugins inline rather than loading
// the fixture's vite.config.ts. This is because rolldown v0.2.1 (used by vite-plus-core)
// has a bug where combining transform.define with a plugin transform that returns
// { code, map: null } triggers "TypeError: Cannot convert undefined or null to object" in
// the bundleConfigFile WASM binding. Bypassing config file loading avoids the bug while
// still exercising all real behaviour: SSR runner, HMR bridge, state preservation.
import { test, expect, afterEach } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync } from "node:fs";
import { createServer, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { vueTui } from "../src/index.ts";
import { capture, waitFor } from "./helpers.ts";

const root = fileURLToPath(new URL("./fixtures/basic", import.meta.url));
const appVue = fileURLToPath(new URL("./fixtures/basic/src/app.vue", import.meta.url));
let server: ViteDevServer | undefined;
const origAppVue = readFileSync(appVue, "utf8");

afterEach(async () => {
  await server?.close();
  server = undefined;
  writeFileSync(appVue, origAppVue);
  delete (globalThis as Record<string, unknown>).__VT_TEST_STDOUT__;
});

test("boots the app in-process and renders a frame", async () => {
  const read = capture();
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [...vueTui(), vue()],
  });
  await server.listen();
  await waitFor(read, "LABEL-A");
  expect(read()).toContain("count=");
});

test("template-only edit hot-swaps with state preserved (no reload)", async () => {
  const read = capture();
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [...vueTui(), vue()],
  });
  await server.listen();
  await waitFor(read, "count=3"); // let the counter tick
  writeFileSync(appVue, origAppVue.replace("LABEL-A", "LABEL-B-HOT"));
  await waitFor(read, "LABEL-B-HOT");
  // The first post-edit frame's count must be >= the pre-edit count (state kept, not reset to 0).
  const after = read().slice(read().indexOf("LABEL-B-HOT"));
  const m = after.match(/count=(\d+)/);
  expect(Number(m![1])).toBeGreaterThanOrEqual(3);
});
