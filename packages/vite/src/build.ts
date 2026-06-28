import type { Plugin } from "vite";
import { isExternalId } from "./external.ts";

// Production build path: `vite build` → a Node entry. The dev plugins are apply: "serve" and this
// one is apply: "build", so they coexist in the vueTui() array and Vite applies the right set per
// mode.
//
// Vite 8 is Rolldown-powered: the build field is `rolldownOptions`; `rollupOptions` is a deprecated
// back-compat alias. We emit `rolldownOptions`, and detect a consumer's external under EITHER name
// (the alias proxy is only wired up later during config resolution, not in this config() hook).
//
// Distribution shape is the APP AUTHOR's call, not ours. By DEFAULT we externalize bare deps (Node
// resolves vue/@vue-tui/runtime/… from node_modules at runtime — the library / app-shipped-with-
// node_modules shape). But if the consumer sets their own external in vite.config.ts — e.g. to
// bundle everything into one self-contained file for a binary:
//   rolldownOptions: { external: (id) => isBuiltin(id), platform: "node",
//                      output: { inlineDynamicImports: true } }
// — we YIELD to it. Vite merges a plugin's config() OVER the user config, so without this guard our
// predicate would silently clobber theirs (the consumer couldn't change the build shape).
export function buildConfigPlugin(opts: { entry?: string }): Plugin {
  const entry = opts.entry ?? "src/main.ts";
  return {
    name: "vue-tui:build",
    apply: "build",
    config(userConfig) {
      const userBuild = userConfig?.build;
      const consumerSetExternal =
        userBuild?.rolldownOptions?.external !== undefined ||
        userBuild?.rollupOptions?.external !== undefined;
      return {
        build: {
          // Node runs the output directly — keep modern syntax (top-level await, etc.) instead of
          // down-leveling for browsers.
          target: "esnext",
          // The module-preload polyfill is a browser-only helper; it's meaningless for a Node entry.
          modulePreload: false,
          rolldownOptions: {
            // Name the entry directly so the build does not look for an index.html.
            input: entry,
            // DEFAULT ONLY: externalize bare deps; relative/virtual/SFC ids stay bundled. Omitted
            // when the consumer set their own external, so theirs takes effect instead of this.
            ...(consumerSetExternal ? {} : { external: (id: string) => isExternalId(id) }),
            // Emit `<name>.js` (e.g. main.js) rather than a hashed asset name.
            output: { entryFileNames: "[name].js" },
          },
        },
      };
    },
  };
}
