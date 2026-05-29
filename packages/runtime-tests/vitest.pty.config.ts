import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vueJsx()],
  test: {
    include: ["integration/pty/**/*.test.{ts,tsx}"],
    // node-pty requires child_process.fork(), not worker_threads, so the pool
    // MUST be "forks". Each test spawns its own isolated PTY subprocess (no
    // shared ports/files/global state), so test files parallelize safely across
    // forked workers — ~3x faster than serial (the PTY suite is the CI's
    // wall-clock bottleneck). testTimeout stays generous (15s vs ~2s slowest
    // test) to absorb CPU contention on smaller CI runners.
    pool: "forks",
    fileParallelism: true,
    testTimeout: 15000,
    env: { FORCE_COLOR: "3" },
  },
});
