import { isBuiltin } from "node:module";
import { defaultServerConditions, defaultServerMainFields, defineConfig } from "vite";
import vue from "unplugin-vue/vite";

const input = "src/main.ts";

// This application intentionally builds without @vue-tui/vite. The plugin is optional dev/HMR
// tooling; Vite and the Vue compiler are sufficient for a production Node bundle.
export default defineConfig({
  input,
  plugins: [vue()],
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
        entryFileNames: "game.mjs",
        codeSplitting: false,
      },
    },
  },
});
