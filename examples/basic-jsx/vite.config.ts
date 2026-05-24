import { defineConfig } from "vite";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [vueJsx()],
  build: {
    target: "node22",
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: `${here}src/main.tsx`,
      formats: ["es"],
      fileName: () => "game.mjs",
    },
    rollupOptions: {
      external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0"),
    },
  },
});
