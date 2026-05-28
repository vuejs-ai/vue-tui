import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vueJsx()],
  test: {
    include: ["integration/pty/**/*.test.{ts,tsx}"],
    fileParallelism: false,
    testTimeout: 15000,
    env: { FORCE_COLOR: "3" },
  },
});
