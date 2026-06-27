import { defineConfig } from "vite-plus";

// Examples smoke suite (#212). Each test spawns a real example through a pseudo-terminal — a dev
// server or a `node dist/main.js` build — and waits for it to paint. Kept separate from the unit
// and PTY-fixture suites because it shells out to `vite`/`node` and needs build-and-launch
// headroom rather than the fast in-process render timings the other configs assume.
export default defineConfig({
  test: {
    include: ["integration/examples/**/*.test.ts"],
    // node-pty requires child_process.fork(), not worker threads, so the pool MUST be "forks".
    pool: "forks",
    // Serialize test FILES (same resolution as @vue-tui/vite's dev-server suite, PR #222). PTY-process
    // isolation does NOT isolate on-disk state: a launched example writes its optimizeDeps cache to
    // examples/<name>/node_modules/.vite and its bundle to examples/<name>/dist. Two files launching
    // the SAME example at once would race that shared cache/dist dir — the #222 failure mode (one
    // esbuild optimizer rmdir/rewrites .vite/deps mid-import → ENOTEMPTY locally, or a transport
    // disconnect → "failed to launch" on a contended runner). It can't happen today (one serial file,
    // and each example owns its cache), but pinning serial files keeps it safe as the suite grows.
    fileParallelism: false,
    // Build + cold Node start + first paint, plus CPU contention when this runs alongside the other
    // suites under `vp run ready` / CI. Generous on purpose; a healthy launch resolves in seconds.
    testTimeout: 60000,
    hookTimeout: 60000,
    // FORCE_COLOR so the spawned apps emit ANSI; CI:false so vue-tui's interactive detection stays
    // on for the real PTY (the launch helper sets both per-child too, this covers the runner level).
    env: { FORCE_COLOR: "3", CI: "false" },
  },
});
