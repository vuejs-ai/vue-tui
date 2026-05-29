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
    // Files parallelize across forked workers (~3x faster than serial — the PTY
    // suite is the CI bottleneck). Tests within a file run SERIALLY: many of
    // these assert timing-sensitive render/commit counts driven by the ~32ms
    // commit throttle, and in-file concurrency starves them of wall-clock on a
    // 4-core CI runner (it passes on higher-core dev machines, which is the
    // trap). File-level parallelism is the proven, stable win.
    fileParallelism: true,
    testTimeout: 15000,
    env: { FORCE_COLOR: "3" },
  },
});
