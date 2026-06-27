import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";
import Vue from "unplugin-vue/rolldown";
import VueVite from "unplugin-vue/vite";

export default defineConfig({
  // `VueVite` compiles `.vue` SFCs in the dev/test graph (unit tests may
  // import .vue components directly). The `pack` build has its own `Vue`
  // rolldown plugin below.
  plugins: [vueJsx(), VueVite()],
  pack: {
    entry: ["src/index.ts"],
    plugins: [
      Vue({
        isProduction: true,
      }),
    ],
    // Keep @vue-tui/runtime out of the bundle — components import from
    // it at runtime rather than bundling it in.
    deps: { neverBundle: ["@vue-tui/runtime"] },
    dts: { vue: true },
    exports: true,
  },
});
