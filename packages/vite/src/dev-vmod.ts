import type { Plugin } from "vite";

export const DEV_VMOD_ID = "virtual:vue-tui/dev";
// Rollup convention: a "\0"-prefixed id marks a virtual module so no other plugin /
// the filesystem tries to resolve it. Kept in the bundle by isExternalId().
export const RESOLVED_DEV_VMOD_ID = "\0" + DEV_VMOD_ID;

// The snippet is TRANSFORMED by Vite (so its import.meta.hot is live, unlike the
// externalized runtime), then hands that hot to the runtime's dev API.
const SNIPPET =
  'import { connectDevtools } from "@vue-tui/runtime/internal";\n' +
  "if (import.meta.hot) connectDevtools(import.meta.hot);\n";

export function devVmodPlugin(): Plugin {
  return {
    name: "vue-tui:dev-vmod",
    apply: "serve",
    resolveId(id) {
      if (id === DEV_VMOD_ID) return RESOLVED_DEV_VMOD_ID;
    },
    load(id) {
      if (id === RESOLVED_DEV_VMOD_ID) return SNIPPET;
    },
  };
}
