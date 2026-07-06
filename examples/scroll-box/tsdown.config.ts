import { defineConfig } from "tsdown";
import Vue from "unplugin-vue/rolldown";

// Self-contained Node build → dist/main.mjs. See examples/basic-template/tsdown.config.ts for the
// rationale behind platform:node + deps.alwaysBundle + onlyBundle:false.
export default defineConfig({
  entry: ["src/main.ts"],
  platform: "node",
  format: "esm",
  deps: { alwaysBundle: [/./], onlyBundle: false },
  plugins: [Vue()],
});
