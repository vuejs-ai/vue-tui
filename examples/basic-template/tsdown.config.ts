import { defineConfig } from "tsdown";
import vue from "unplugin-vue/rolldown";

// Production build: bundle the whole app into one self-contained Node file (dist/main.mjs) that
// `node` runs with no node_modules present. `platform: "node"` keeps Node builtins external and
// emits a real createRequire for CJS deps; `deps.alwaysBundle` inlines everything else (tsdown
// externalizes declared deps by default, the library behavior); `onlyBundle: false` silences the
// resulting "you are bundling dependencies" hint (intentional for an app). Dev/HMR is separate —
// it runs through vite + @vue-tui/vite (see vite.config.ts).
export default defineConfig({
  entry: ["src/main.ts"],
  platform: "node",
  format: "esm",
  deps: { alwaysBundle: [/./], onlyBundle: false },
  plugins: [vue()],
});
