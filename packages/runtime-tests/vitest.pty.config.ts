import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["integration/pty/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
    env: { FORCE_COLOR: "3" },
  },
});
