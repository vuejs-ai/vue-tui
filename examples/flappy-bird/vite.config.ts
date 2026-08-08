import { defineConfig } from "vite";
import vue from "unplugin-vue/vite";

const input = "src/main.ts";

// This application intentionally builds without @vue-tui/vite. The plugin is optional dev/HMR
// tooling; Vite and the Vue compiler are sufficient for a production Node bundle.
export default defineConfig(({ command }) => ({
  input,
  plugins: [vue()],
  build: {
    ssr: input,
    target: "node22",
    modulePreload: false,
    copyPublicDir: false,
    rolldownOptions: {
      output: {
        format: "esm",
        entryFileNames: "game.mjs",
        codeSplitting: false,
      },
    },
  },
  ssr: command === "build" ? { noExternal: true } : undefined,
}));
