import { defineConfig } from "vite";
import vue from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

const input = "src/main.ts";

export default defineConfig(({ command }) => ({
  input,
  plugins: [vue(), vueTui({ entry: input })],
  build: {
    // Select Vite's Node environment. `input` remains the one app entry used by dev and build.
    ssr: input,
    target: "node22",
    modulePreload: false,
    copyPublicDir: false,
    rolldownOptions: {
      output: {
        format: "esm",
        entryFileNames: "main.mjs",
        codeSplitting: false,
      },
    },
  },
  // A standalone TUI app ships its dependencies in one Node bundle. Keep dependencies external
  // during development so Vite's module runner can load their native Node entry points.
  ssr: command === "build" ? { noExternal: true } : undefined,
}));
