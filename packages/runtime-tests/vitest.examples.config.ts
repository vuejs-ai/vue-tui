import { defineConfig } from "vite-plus";

// Examples smoke suite (#212). Each test spawns a real example through a pseudo-terminal — a dev
// server or a `node dist/main.js` build — and waits for it to paint. Kept separate from the unit
// and PTY-fixture suites because it shells out to `vite`/`node` and needs build-and-launch
// headroom rather than the fast in-process render timings the other configs assume.
export default defineConfig({
  test: {
    include: ["integration/examples/**/*.test.ts"],
    // node-pty requires child_process.fork(), not worker threads, so the pool MUST be "forks".
    // Each test owns an isolated PTY subprocess (no shared ports/files), so files parallelize safely.
    pool: "forks",
    fileParallelism: true,
    // Build + cold Node start + first paint, plus CPU contention when this runs alongside the other
    // suites under `vp run ready` / CI. Generous on purpose; a healthy launch resolves in seconds.
    testTimeout: 60000,
    hookTimeout: 60000,
    // FORCE_COLOR so the spawned apps emit ANSI; CI:false so vue-tui's interactive detection stays
    // on for the real PTY (the launch helper sets both per-child too, this covers the runner level).
    env: { FORCE_COLOR: "3", CI: "false" },
  },
});
