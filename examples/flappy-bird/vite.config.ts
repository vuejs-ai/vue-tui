import { isBuiltin } from "node:module";
import { defineConfig } from "vite";
import vue from "unplugin-vue/vite";

const input = "src/main.ts";

// This app shows that @vue-tui/runtime does not depend on @vue-tui/vite.
// Without the plugin, the app owns its Vite build settings.
export default defineConfig({
  input,
  plugins: [vue()],
  build: {
    target: "node22",
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
