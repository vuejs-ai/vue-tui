import { defineConfig } from "tsdown";
import vueJsx from "unplugin-vue-jsx/rolldown";

// This example authors in JSX (.tsx), so the build uses unplugin-vue-jsx (Vue's JSX transform)
// instead of unplugin-vue. Self-contained Node build → dist/main.mjs. See
// examples/basic-template/tsdown.config.ts for the platform:node + deps.alwaysBundle rationale.
export default defineConfig({
  entry: ["src/main.tsx"],
  platform: "node",
  format: "esm",
  deps: { alwaysBundle: [/./], onlyBundle: false },
  plugins: [vueJsx()],
});
