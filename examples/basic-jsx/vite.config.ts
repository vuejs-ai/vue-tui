import { defineConfig } from "vite";
import vueJsx from "@vitejs/plugin-vue-jsx";
import vueJsxBuild from "unplugin-vue-jsx/vite";
import { vueTui } from "@vue-tui/vite";

const input = "src/main.tsx";

export default defineConfig(({ command }) => ({
  input,
  // The HMR-capable compiler follows Vite's server build mode. Use the context-independent Vite
  // integration for production so this client renderer does not receive SSR render functions.
  plugins: command === "serve" ? [vueJsx(), vueTui({ entry: input })] : [vueJsxBuild()],
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
