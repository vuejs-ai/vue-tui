import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vueJsx()],
  test: {
    globals: true,
  },
  pack: {
    dts: true,
    exports: true,
  },
});
