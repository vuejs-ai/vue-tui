import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vueJsx()],
  test: {
    // chalk disables color in non-TTY envs; force it on so ANSI style bugs don't hide from tests.
    // CI:"false" because the runner sets CI=true, which flips vue-tui's default live-update
    // detection (`!isInCi && isTTY`) off — disabling the resize listener,
    // cursor, and ANSI erases that these render tests exercise. The PTY child helpers
    // already force CI=false for the same reason; do it for the in-process suite too.
    env: { FORCE_COLOR: "3", CI: "false" },
    // Files parallelize, but tests within a file run serially: many assert
    // timing-sensitive render/commit/flush counts that destabilize under
    // in-file concurrency on a constrained (4-core) CI runner.
    // PTY tests run separately via vitest.pty.config.ts (they need node-pty's forks pool and a longer timeout)
    // Examples smoke tests run separately via vitest.examples.config.ts (same forks-pool + headroom
    // needs); exclude them here so they don't also run under this config's pool/timeout and execute twice.
    exclude: ["integration/pty/**", "integration/examples/**", "node_modules/**"],
  },
  lint: {
    ignorePatterns: ["integration/pty/fixtures/**", "integration/subprocess-fixtures/*.mjs"],
  },
});
