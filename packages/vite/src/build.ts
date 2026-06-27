import type { Plugin } from "vite";
import { isExternalId } from "./external.ts";

// Production build path: `vite build` → a single self-contained Node entry. The dev plugins are
// apply: "serve" and this one is apply: "build", so they coexist in the vueTui() array and Vite
// applies the right set per mode.
export function buildConfigPlugin(opts: { entry?: string }): Plugin {
  const entry = opts.entry ?? "src/main.ts";
  return {
    name: "vue-tui:build",
    apply: "build",
    config() {
      return {
        build: {
          // Node runs the output directly — keep modern syntax (top-level await, etc.) instead of
          // down-leveling for browsers.
          target: "esnext",
          // The module-preload polyfill is a browser-only helper; it's meaningless for a Node entry.
          modulePreload: false,
          rollupOptions: {
            // Name the entry directly so the build does not look for an index.html.
            input: entry,
            // Bare deps resolve from node_modules at runtime by Node; relative/virtual ids stay bundled.
            external: (id: string) => isExternalId(id),
            // Emit `<name>.js` (e.g. main.js) rather than a hashed asset name.
            output: { entryFileNames: "[name].js" },
          },
        },
      };
    },
  };
}
