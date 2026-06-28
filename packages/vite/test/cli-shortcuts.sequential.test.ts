// SEQUENTIAL: starts a live dev server (binds a port) and briefly forces process.stdin.isTTY
// + clears process.env.CI to exercise Vite's CLI-shortcut enable gate. Both are process
// globals (restored in finally), so this must not run concurrently with other files.
import { test, expect, afterEach } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { vueTui } from "../src/index.ts";
import { capture, waitFor } from "./helpers.ts";

const root = fileURLToPath(new URL("./fixtures/basic", import.meta.url));
let server: ViteDevServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  delete (globalThis as Record<string, unknown>).__VT_TEST_STDOUT__;
});

// The in-process TUI owns process.stdin (raw mode). Vite's CLI keyboard shortcuts
// (server.bindCLIShortcuts) ALSO attach a readline 'line' listener to process.stdin, so a
// submitted "q"/"r"/... line runs a dev-server action (q = server.close()) out from under the
// running app — a footgun the in-process architecture introduces. vueTui must neutralize it.
// bindCLIShortcuts only acts with an httpServer + (isTTY && !CI); under that gate it creates
// server._shortcutsState (the readline). Assert vueTui leaves no _shortcutsState.
test("vueTui disables Vite's CLI keyboard shortcuts so they can't hijack the TUI's stdin", async () => {
  const read = capture();
  server = await createServer({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [vue(), vueTui()],
  });
  await server.listen(); // a real httpServer is required for bindCLIShortcuts to act
  await waitFor(read, "count="); // let the app mount with the normal (non-TTY) stdin first

  const stdin = process.stdin as { isTTY?: boolean };
  const origTTY = stdin.isTTY;
  const origCI = process.env.CI;
  stdin.isTTY = true; // force the bindCLIShortcuts enable gate (isTTY && !CI)
  delete process.env.CI;
  try {
    server.bindCLIShortcuts({ print: false });
    expect((server as { _shortcutsState?: unknown })._shortcutsState).toBeUndefined();
  } finally {
    stdin.isTTY = origTTY;
    if (origCI !== undefined) process.env.CI = origCI;
  }
});
