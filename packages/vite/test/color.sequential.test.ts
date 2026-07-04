// SEQUENTIAL: mutates globalThis.__VT_TEST_STDOUT__ (a process-global frame capture seam)
// and starts a live Vite dev server that binds OS ports — see dev.sequential.test.ts's
// header for the full rationale. Grouped with the other dev-server tests for the same reason.
//
// Regression for vue-tui#214 ("macos zsh 开发模式 Text 组件颜色丢失"): `vue-tui dev` rendered
// <Text color>/<Box borderColor> with NO ANSI color even in a real terminal, while the built
// bundle (`node dist/main.js`) showed color. Root cause was the old @vue-tui/cli dev path: it
// bundled the app in Vite's CLIENT environment, whose resolve conditions omit "node", so chalk's
// `#supports-color` import resolved to its BROWSER shim — hard-coded to level 0 under Node, so
// chalk emitted no SGR regardless of FORCE_COLOR or a real TTY.
//
// The current @vue-tui/vite dev path runs the app in Vite's SSR runnable environment, which
// resolves chalk with Node conditions (and externalizes it), so chalk does real TTY/FORCE_COLOR
// detection and emits color. This test pins that: with FORCE_COLOR forced on (vite.config.ts
// test.env, since chalk locks its level at import time), a dev-rendered <Text color="green">
// must carry the green SGR. If chalk ever regressed to the browser shim, level would be 0 and the
// SGR would vanish even with FORCE_COLOR set — exactly the #214 failure — and this test would catch it.
import { test, expect, afterEach } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { vueTui } from "../src/index.ts";
import { capture, waitFor } from "./helpers.ts";

// SGR escapes, matching the runtime-tests "\x1b[..m" convention. A NAMED chalk color is a fixed
// ANSI-16 code even at level 3 (truecolor) — green fg is always ESC[32m … ESC[39m, never a 38;2;…
// rgb sequence (only hex/rgb() inputs use those), so this literal is stable under FORCE_COLOR=3.
const GREEN = "\x1b[32m";
const FG_RESET = "\x1b[39m";
const root = fileURLToPath(new URL("./fixtures/color", import.meta.url));
let server: ViteDevServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  delete (globalThis as Record<string, unknown>).__VT_TEST_STDOUT__;
});

test("#214: dev-mode <Text color> emits real ANSI color", async () => {
  const read = capture();
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
  });
  await server.listen();
  await waitFor(read, "COLORTEST");
  // Asserting the SGR (not just the text) is what distinguishes the fix from #214 — under the
  // browser-shim bug the escape codes never appear, leaving bare "COLORTEST".
  expect(read()).toContain(`${GREEN}COLORTEST${FG_RESET}`);
});
