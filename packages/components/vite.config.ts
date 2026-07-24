import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";
import Vue from "unplugin-vue/rolldown";
import VueVite from "unplugin-vue/vite";

export default defineConfig({
  plugins: [vueJsx(), VueVite()],
  pack: {
    // Components and runtime must resolve the consumer's one supported Vue
    // instance. Bundling Vue declarations duplicates global macros and module
    // augmentations when a consumer uses another Vue patch release.
    deps: { neverBundle: ["vue", /^@vue\//] },
    plugins: [Vue({ isProduction: true })],
    dts: { vue: true },
    exports: true,
  },
  test: {
    globals: true,
    env: { FORCE_COLOR: "3", CI: "false" },
  },
});
