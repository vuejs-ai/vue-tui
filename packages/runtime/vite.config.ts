import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vueJsx()],
  pack: {
    entry: ["src/index.ts", "src/internal.ts"],
    dts: true,
    exports: true,
  },
});
