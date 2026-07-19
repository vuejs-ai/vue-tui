// SEQUENTIAL: mutates globalThis.__VT_TEST_STDOUT__ (a process-global frame capture
// seam) and starts a live Vite dev server that binds OS ports. Running these tests
// concurrently with other files would race on the global and risk port conflicts.
// Frames are captured via globalThis.__VT_TEST_STDOUT__.
//
// NOTE: We pass configFile: false and provide vueTui() plugins inline rather than loading
// the fixture's vite.config.ts — see dev.sequential.test.ts for the rolldown WASM bug this
// works around. It still exercises the real SSR runner + HMR bridge + dev overlay.
//
// We point at a DEDICATED fixtures/overlay (a copy of fixtures/basic) instead of sharing
// fixtures/basic with dev.sequential.test.ts. Test FILES run in parallel (fileParallelism),
// and both files mutate their fixture's app.vue; if they shared one file the edits would
// race (one test's restore/edit clobbers the other's syntax error before the overlay
// renders), which is exactly what made this test flake in the full suite.
import { test, expect, afterEach } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync } from "node:fs";
import { createServer, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { vueTui } from "../src/index.ts";
import { capture, waitFor } from "./helpers.ts";

const root = fileURLToPath(new URL("./fixtures/overlay", import.meta.url));
const appVue = fileURLToPath(new URL("./fixtures/overlay/src/app.vue", import.meta.url));
let server: ViteDevServer | undefined;
const origAppVue = readFileSync(appVue, "utf8");

afterEach(async () => {
  const testGlobal = globalThis as Record<string, unknown>;
  const app = testGlobal.__VT_TEST_APP__ as { unmount(): void } | undefined;
  app?.unmount();
  await server?.close();
  server = undefined;
  writeFileSync(appVue, origAppVue);
  delete (globalThis as Record<string, unknown>).__VT_TEST_STDOUT__;
  delete (globalThis as Record<string, unknown>).__VT_TARGET_INSTANCE__;
  delete (globalThis as Record<string, unknown>).__VT_TARGET_CURRENT__;
  delete (globalThis as Record<string, unknown>).__VT_TEST_APP__;
});

test("a script hot update preserves public layout observations", async () => {
  const read = capture();
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
  });
  await server.listen();
  await waitFor(read, "box=7x2");

  writeFileSync(
    appVue,
    origAppVue.replace('const label = "LABEL-A";', 'const label = "LABEL-B-HOT";'),
  );
  await waitFor(read, "LABEL-B-HOT");

  const updatedOutput = read().slice(read().lastIndexOf("LABEL-B-HOT"));
  expect(updatedOutput).toMatch(/layout=\d+xunbounded/);
  expect(updatedOutput).toContain("box=7x2");
  expect(updatedOutput).not.toContain("box=pending");
});

test("a build error renders the in-process dev overlay", async () => {
  const read = capture();
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
  });
  await server.listen();
  await waitFor(read, "LABEL-A");

  // Introduce a <script setup> syntax error. A *script* error (not a template one) is
  // what Vite surfaces server-side as a typed { type: "error" } HMR broadcast: it's
  // caught while compiling the SFC's script for the update, whereas a broken *template*
  // only fails later in the runner's lazy module fetch and never broadcasts an error.
  // The bridge forwards that { type: "error" } payload to the SSR runner, whose HMR
  // handler dispatches `vite:error` → the runtime sets devState → the overlay renders.
  writeFileSync(
    appVue,
    origAppVue.replace("const count = shallowRef(0);", "const count = shallowRef(0); const x =;"),
  );

  // "Build Error" is the overlay's static ErrorDisplay header (runtime/src/overlay.ts) —
  // a robust marker independent of the compiler's wording. We also assert a stable
  // fragment of the compiler diagnostic to prove the real error text reaches the overlay
  // (not just the static header).
  await waitFor(read, "Build Error");
  expect(read()).toContain("Build Error");
  expect(read()).toContain("compiler-sfc");
}, 15000);
