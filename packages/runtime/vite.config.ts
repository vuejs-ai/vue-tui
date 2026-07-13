import { defineConfig } from "vite-plus";
import vueJsx from "@vitejs/plugin-vue-jsx";
import Vue from "unplugin-vue/rolldown";
import VueVite from "unplugin-vue/vite";

// Host primitive tags carry a `tui-` prefix (mirroring Ink's `ink-box`/`ink-text`):
// it keeps the renderer's intrinsic elements out of the component namespace so a
// template `<tui-box>` never collides with the public `<Box>` component (no vue-tsc
// self-recursion). The hyphen also makes them valid custom-element names.
const HOST_TAGS = ["tui-box", "tui-text", "tui-virtual-text", "tui-static", "tui-transform"];

export default defineConfig({
  // `VueVite` parses `.vue` SFCs in the TEST/dev graph (unit tests may import the
  // .vue components directly, e.g. host/text-measure.test.ts). The `pack` build has
  // its own `Vue` rolldown plugin below; both need `isCustomElement` so the host
  // tags (`<tui-box>` / `<tui-text>` / …) inside SFC templates compile to raw element
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
    entry: ["src/index.ts", "src/fullscreen.ts", "src/internal.ts"],
    // Runtime and declaration output must use the consumer's one Vue instance.
    // Inlining Vue's internal types creates duplicate global declarations when
    // the consumer installs another supported Vue patch release.
    deps: { neverBundle: ["vue", /^@vue\//] },
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
