import { defineConfig } from "tsdown";
import Vue from "unplugin-vue/rolldown";

// Self-contained Node build → dist/game.mjs, runnable with no node_modules present. See
// examples/basic-template/tsdown.config.ts for the platform:node + deps.alwaysBundle rationale.
export default defineConfig({
  entry: { game: "src/main.ts" },
  platform: "node",
  format: "esm",
  deps: { alwaysBundle: [/./], onlyBundle: false },
  plugins: [Vue()],
});
