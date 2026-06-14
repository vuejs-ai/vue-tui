import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";
import Vue from "unplugin-vue/rolldown";
import VueVite from "unplugin-vue/vite";

const HOST_TAGS = ["box", "text", "virtual-text", "static", "transform"];

export default defineConfig({
  // `VueVite` parses `.vue` SFCs in the TEST/dev graph (unit tests may import the
  // .vue components directly, e.g. host/text-measure.test.ts). The `pack` build has
  // its own `Vue` rolldown plugin below; both need `isCustomElement` so the host
  // tags (`<box>` / `<text>` / …) inside SFC templates compile to raw element
  // vnodes instead of being resolved as components.
  plugins: [
    vueJsx(),
    VueVite({
      template: {
        compilerOptions: {
          isCustomElement: (tag: string) => HOST_TAGS.includes(tag),
        },
      },
    }),
  ],
  pack: {
    entry: ["src/index.ts", "src/internal.ts"],
    plugins: [
      Vue({
        isProduction: true,
        template: {
          compilerOptions: {
            isCustomElement: (tag: string) => HOST_TAGS.includes(tag),
          },
        },
      }),
    ],
    dts: { vue: true },
    exports: true,
  },
});
