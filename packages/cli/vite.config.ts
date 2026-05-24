import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/hmr-loader.ts"],
    format: "esm",
    shims: true,
  },
});
