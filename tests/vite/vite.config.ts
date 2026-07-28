import { availableParallelism } from "node:os";
import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["{e2e,integration}/**/*.test.{ts,tsx}"],
    // Every file owns an isolated scratch root, cache, port, and child
    // environment. Forked workers isolate parent state while leaving two CPUs
    // available for the real CLI children they launch.
    pool: "forks",
    fileParallelism: true,
    maxWorkers: Math.max(1, availableParallelism() - 2),
    // Real CLI startup, HMR, and cleanup cross process boundaries. Keep enough
    // headroom for the harness diagnostic timeout to surface first.
    testTimeout: 45000,
  },
});
