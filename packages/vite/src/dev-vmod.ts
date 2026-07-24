import type { Plugin } from "vite";

export const DEV_VMOD_ID = "virtual:vue-tui/dev";
// Rollup convention: a "\0"-prefixed id marks a virtual module so no other plugin /
// the filesystem tries to resolve it.
export const RESOLVED_DEV_VMOD_ID = "\0" + DEV_VMOD_ID;

export type DevSessionRef = { sessionId: string };

// The snippet is TRANSFORMED by Vite (so its import.meta.hot is live, unlike the
// externalized runtime), then hands that hot + session identity to the runtime's
// privileged dev API.
function snippet(sessionId: string): string {
  return (
    'import { connectDevtools } from "@vue-tui/runtime/internal/devtools";\n' +
    "if (import.meta.hot) connectDevtools(import.meta.hot, { sessionId: " +
    JSON.stringify(sessionId) +
    " });\n"
  );
}

export function devVmodPlugin(session: DevSessionRef): Plugin {
  return {
    name: "vue-tui:dev-vmod",
    apply: "serve",
    resolveId(id) {
      if (id === DEV_VMOD_ID) return RESOLVED_DEV_VMOD_ID;
    },
    load(id) {
      if (id === RESOLVED_DEV_VMOD_ID) return snippet(session.sessionId);
    },
  };
}
