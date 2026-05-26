import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["integration/pty/**/*.test.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    isolate: false,
    testTimeout: 10000,
    env: { FORCE_COLOR: "3" },
  },
});
