import { defineConfig } from "tsdown";
import Vue from "unplugin-vue/rolldown";

export default defineConfig({
  entry: ["src/main.ts"],
  platform: "node",
  format: "esm",
  deps: { alwaysBundle: [/./], onlyBundle: false },
  plugins: [Vue()],
});
