import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { isBuiltin } from "node:module";

const here = fileURLToPath(new URL(".", import.meta.url));

// Build the example as a SELF-CONTAINED Node ESM bundle: a single dist/game.mjs that `node` runs
// with no node_modules present (the stepping stone toward a distributable binary). Bundle EVERYTHING
// that can be bundled (vue, chalk, @vue-tui/runtime, yoga's base64-inlined wasm, the SFC) and
// externalize ONLY Node's own builtins — isBuiltin() matches both "node:fs" and bare "fs". A
// builtins-only rule has no relative/absolute path heuristics, so the Windows path footgun behind
// vue-tui#209 can't exist here. `platform: "node"` makes rolldown emit a real
// createRequire(import.meta.url) for a CJS dep's require() instead of a stub that throws at startup
// (stack-utils does `require("module").builtinModules` at module load — the #212 fault class).
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
    // Vite 8 is Rolldown-powered: rolldownOptions is the field (rollupOptions is the deprecated alias).
    rolldownOptions: {
      platform: "node",
      external: (id) => isBuiltin(id),
    },
  },
});
