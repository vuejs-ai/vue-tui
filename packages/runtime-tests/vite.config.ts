import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vueJsx()],
  test: {
    // chalk disables color in non-TTY envs; force it on so ANSI style bugs don't hide from tests
    env: { FORCE_COLOR: "1" },
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {},
});
