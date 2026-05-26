import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vueJsx()],
  test: {
    // chalk disables color in non-TTY envs; force it on so ANSI style bugs don't hide from tests
    env: { FORCE_COLOR: "3" },
    // PTY tests run separately via vitest.pty.config.ts (they need node-pty, no parallelism, longer timeout)
    exclude: ["integration/pty/**", "node_modules/**"],
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {},
});
