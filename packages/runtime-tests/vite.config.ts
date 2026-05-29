import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vueJsx()],
  test: {
    // chalk disables color in non-TTY envs; force it on so ANSI style bugs don't hide from tests
    env: { FORCE_COLOR: "3" },
    // Files parallelize, but tests within a file run serially: many assert
    // timing-sensitive render/commit/flush counts that destabilize under
    // in-file concurrency on a constrained (4-core) CI runner.
    // PTY tests run separately via vitest.pty.config.ts (they need node-pty's forks pool and a longer timeout)
    exclude: ["integration/pty/**", "node_modules/**"],
  },
  lint: {
    ignorePatterns: ["integration/pty/fixtures/**"],
  },
});
