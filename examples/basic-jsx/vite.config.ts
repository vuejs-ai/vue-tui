import { isBuiltin } from "node:module";
import { defaultServerConditions, defaultServerMainFields, defineConfig } from "vite";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { vueTui } from "@vue-tui/vite";

const input = "src/main.tsx";

export default defineConfig({
  input,
  plugins: [vueJsx(), vueTui()],
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
