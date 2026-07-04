import { defineConfig } from "vite-plus";
export default defineConfig({
  pack: { entry: ["src/index.ts"], format: "esm", shims: true, dts: true },
  test: {
    // chalk locks its color level at import time and disables color in non-TTY envs; force it on so
    // ANSI/color regressions (e.g. vue-tui#214 dev-mode color loss) can't hide from the dev-server
    // tests. CI:"false" because the runner sets CI=true, which flips vue-tui's interactive detection
    // (interactive = !isInCi && isTTY) off — matching the runtime-tests convention.
    env: { FORCE_COLOR: "3", CI: "false" },
    // Run this package's test FILES serially. Test files run in SEPARATE processes (verified:
    // distinct pids, no shared globalThis), so the cross-file hazard is not a JS global — it is the
    // shared FILESYSTEM. Every *.sequential.test.ts boots a live Vite dev server, and the fixtures
    // have no local node_modules, so all servers resolve the SAME optimizeDeps cache dir
    // (packages/vite/node_modules/.vite). Under the monorepo default (fileParallelism: true) two
    // servers run at once and their dep optimizers race on that shared .vite/deps dir — one
    // rewrites/rmdir's it while another is mid-import. Locally that surfaces as
    // "ENOTEMPTY: rmdir .vite/deps"; on the contended CI runner a sibling's re-bundle invalidates a
    // server's cache and restarts its module-runner transport mid-import → "transport was
    // disconnected → failed to launch → 5s test timeout" (the flake that broke main CI). Serial
    // files keep exactly one dev server (and one bound port) alive at a time. Reproduced ~30% under
    // CPU saturation before this; 0/25 after.
    fileParallelism: false,
    // The dev-server tests poll readiness with waitUntil (helpers.ts), whose own budget is 8000ms —
    // ABOVE Vitest's default 5000ms test timeout, so a slow cold-optimize boot was killed by the
    // framework before waitUntil could even finish (the cryptic "Test timed out in 5000ms"). Raise
    // the ceiling above the helper budget so a genuine hang surfaces via waitUntil's diagnostic and
    // a slow boot has headroom (mirrors overlay.sequential's per-test 15000ms).
    testTimeout: 15000,
  },
});
