import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

// Build the example as a Node ESM bundle. SFCs are compiled by
// @vitejs/plugin-vue; runtime deps (vue, @vue-tui/runtime, chalk, …) stay
// external so Node resolves them from node_modules at startup.
export default defineConfig({
  plugins: [vue()],
  build: {
    target: "node22",
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: `${here}src/main.ts`,
      formats: ["es"],
      fileName: () => "game.mjs",
    },
    rollupOptions: {
      // Bundle anything resolved as a relative / absolute path (the .vue
      // file + its `?vue` virtual modules); externalize bare specifiers.
      external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0"),
    },
  },
});
