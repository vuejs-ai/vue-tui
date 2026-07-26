import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";
import Vue from "unplugin-vue/rolldown";
import VueVite from "unplugin-vue/vite";

export default defineConfig({
  plugins: [vueJsx(), VueVite()],
  pack: {
    entry: ["src/index.ts", "src/components.ts"],
    // Helpers, runtime, and consumers must all resolve the consumer's one
    // supported Vue instance.
    deps: { neverBundle: ["vue", /^@vue\//] },
    plugins: [Vue({ isProduction: true })],
    dts: { vue: true },
    exports: true,
  },
  test: {
    globals: true,
    env: { FORCE_COLOR: "3" },
  },
});
