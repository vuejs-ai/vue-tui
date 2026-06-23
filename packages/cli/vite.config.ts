import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/hmr-loader.ts", "src/vite.ts"],
    format: "esm",
    shims: true,
    // Emit declarations so `@vue-tui/cli/vite`'s `external` helper is typed for
    // consumers' vite.config.ts.
    dts: true,
  },
});
