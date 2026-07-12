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
    // NO config-wide retry: it would mask flakiness/real regressions across the
    // WHOLE PTY suite. The signal-teardown tests previously needed retry because
    // the restore bytes were written with an async stream.write() that could lose
    // the race against signal-exit's immediate re-raise under a saturated runner.
    // That is now fixed at the source (render.ts/kitty-keyboard.ts Finding A):
    // the signal path writes the restore escapes synchronously (fs.writeSync), so
    // they reach the fd before the process dies and the tests pass deterministically
    // without any retry. If a genuine parent-side onData read-race ever resurfaces,
    // scope a retry to that suite/test only (e.g. `test(name, { retry: 2 }, fn)`).
    // CI:"false" so the runner's CI=true doesn't flip default live updates off
    // for any in-process render tests under this config (the PTY child helpers
    // set it per-spawn, but vitest-level tests need it too).
    env: { FORCE_COLOR: "3", CI: "false" },
  },
});
