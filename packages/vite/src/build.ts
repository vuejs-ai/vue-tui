import { isBuiltin } from "node:module";
import type { Plugin } from "vite";
import { isExternalId } from "./external.ts";

// Production build path: `vite build` → one Node entry. The dev plugins are apply: "serve" and this
// one is apply: "build", so they coexist in the vueTui() array and Vite applies the right set per
// mode. Two distribution shapes, picked by the `bundle` option:
//   default — externalize bare deps; Node resolves them from node_modules at runtime. Right for a
//     library, or an app shipped next to its node_modules. Smaller output, and Node handles CJS/ESM
//     interop natively (no bundling-interop surface).
//   bundle  — a SELF-CONTAINED single file: bundle everything, externalize only Node builtins. For
//     standalone / single-binary distribution. platform:"node" makes rolldown emit a real
//     createRequire for a CJS dep's require() (e.g. stack-utils' `require("module")`) instead of a
//     stub that throws at startup.
export function buildConfigPlugin(opts: { entry?: string; bundle?: boolean }): Plugin {
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
            // default: bare deps stay external (Node resolves them); relative/virtual ids bundle.
            // bundle: only Node builtins stay external — everything else is bundled into the file.
            external: (id: string) => (opts.bundle ? isBuiltin(id) : isExternalId(id)),
            // bundle: tell rolldown the output runs in Node so require() of a CJS dep becomes a real
            // createRequire instead of a throwing stub.
            ...(opts.bundle ? { platform: "node" as const } : {}),
            // Emit `<name>.js` (e.g. main.js) rather than a hashed asset name.
            output: { entryFileNames: "[name].js" },
          },
        },
      };
    },
  };
}
