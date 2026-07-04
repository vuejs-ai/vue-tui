// SEQUENTIAL: mutates globalThis.__VT_TEST_STDOUT__ (a process-global frame capture
// seam) and starts a live Vite dev server; can't run concurrently with the other dev
// tests. configFile:false + inline plugins — see dev.sequential.test.ts for the reason.
import { test, expect, afterEach } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { vueTui } from "../src/index.ts";
import { capture, waitFor } from "./helpers.ts";

const root = fileURLToPath(new URL("./fixtures/jsx", import.meta.url));
let server: ViteDevServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  delete (globalThis as Record<string, unknown>).__VT_TEST_STDOUT__;
});

// Regression: vueTui() force-client-compiled only its OWN @vitejs/plugin-vue, never a
// user-added @vitejs/plugin-vue-jsx. So in the dev SSR module runner the .tsx compiled
// in SSR mode and the terminal (client) renderer produced a BLANK frame — silently, no
// error. The fix force-client-compiles every vite:vue / vite:vue-jsx plugin in the set.
test("JSX (.tsx) components render in the in-process dev server", async () => {
  const read = capture();
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vueJsx(), vueTui({ entry: "/src/main.tsx" })],
  });
  await server.listen();
  await waitFor(read, "JSX-LABEL");
  expect(read()).toContain("JSX-LABEL");
});
