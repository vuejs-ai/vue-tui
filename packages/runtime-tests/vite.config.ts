import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vueJsx()],
  test: {
    // chalk disables color in non-TTY envs; force it on so ANSI style bugs don't hide from tests
    env: { FORCE_COLOR: "3" },
    // Tests run concurrently by default. Tests that genuinely need serial
    // execution (process-global fake timers) live in their own *.sequential
    // files. Snapshot tests stay concurrent by using the context-local expect.
    sequence: { concurrent: true },
    // PTY tests run separately via vitest.pty.config.ts (they need node-pty's forks pool and a longer timeout)
    exclude: ["integration/pty/**", "node_modules/**"],
  },
  lint: {
    ignorePatterns: ["integration/pty/fixtures/**"],
  },
});
