import { defineConfig } from "vite";
import vue from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

const input = "src/main.ts";

export default defineConfig(({ command }) => ({
  input,
  plugins: [vue(), vueTui({ entry: input })],
  build: {
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
  ssr: command === "build" ? { noExternal: true } : undefined,
}));
