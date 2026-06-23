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
      fileName: () => "game.mjs",
    },
    rollupOptions: {
      // Bundle the app's own source — relative imports, the resolved .vue SFC
      // and its `?vue` virtual modules; externalize bare specifiers for Node to
      // resolve from node_modules at runtime. `node:path`'s isAbsolute() matches
      // the build host's absolute paths, including Windows drive-letter paths
      // (D:\…) when building on Windows — a bare `id.startsWith("/")` check
      // misses those and leaves the SFC unbundled (vue-tui#209). The same
      // predicate is exported as `external` from `@vue-tui/cli/vite`.
      external: (id) => !id.startsWith(".") && !id.startsWith("\0") && !isAbsolute(id),
    },
  },
});
