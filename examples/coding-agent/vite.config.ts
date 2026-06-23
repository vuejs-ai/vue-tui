import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

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
      fileName: () => "agent.mjs",
    },
    rollupOptions: {
      // Bundle the app's own source (relative imports + resolved absolute
      // paths); externalize bare specifiers for Node to resolve at runtime.
      // isAbsolute() matches the build host's absolute paths, including Windows
      // drive-letter paths (D:\…) when building on Windows — a bare
      // `id.startsWith("/")` check would miss those (vue-tui#209).
      external: (id) => !id.startsWith(".") && !id.startsWith("\0") && !isAbsolute(id),
    },
  },
});
