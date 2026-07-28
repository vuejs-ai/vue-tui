import vueJsx from "@vitejs/plugin-vue-jsx";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [vueJsx()],
  test: {
    benchmark: {
      include: ["*.bench.ts"],
    },
  },
});
