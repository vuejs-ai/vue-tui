import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";
import Vue from "unplugin-vue/rolldown";
import VueVite from "unplugin-vue/vite";

export default defineConfig({
  plugins: [vueJsx(), VueVite()],
  pack: {
    plugins: [Vue({ isProduction: true })],
    dts: { vue: true },
    exports: true,
  },
  test: {
    env: { FORCE_COLOR: "3", CI: "false" },
  },
});
