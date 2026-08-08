import { isBuiltin } from "node:module";
import { defaultServerConditions, defaultServerMainFields, defineConfig } from "vite";
import vue from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

const input = "src/main.ts";

export default defineConfig({
  input,
  plugins: [vue(), vueTui()],
  resolve: {
    conditions: [...defaultServerConditions],
    mainFields: [...defaultServerMainFields],
  },
  build: {
    target: "node22",
    modulePreload: false,
    copyPublicDir: false,
    rolldownOptions: {
      platform: "node",
      external: isBuiltin,
      output: {
        format: "esm",
        entryFileNames: "main.mjs",
        codeSplitting: false,
      },
    },
  },
});
