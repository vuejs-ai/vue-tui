import type { Plugin } from "vite";
import { devVmodPlugin } from "./dev-vmod.ts";
import { devPlugin } from "./dev.ts";
import { buildConfigPlugin } from "./build.ts";

export interface VueTuiOptions {
  entry?: string;
}

export function vueTui(options: VueTuiOptions = {}): Plugin[] {
  // devPlugin (apply:"serve") and buildConfigPlugin (apply:"build") never run together — Vite
  // picks the right set per mode. normalizeEntry() (below) derives the entry string each needs.
  //
  // Bring your own SFC/JSX compiler alongside vueTui() — `[vue(), vueTui()]` for SFCs, or
  // `[vueJsx(), vueTui()]` for JSX. devPlugin's configResolved finds whichever is present (by
  // plugin name) and force-client-compiles it, so it emits CLIENT render functions for the
  // terminal renderer even in Vite's SSR dev environment. vueTui deliberately does NOT bundle
  // @vitejs/plugin-vue: the app's authoring format is the consumer's choice, kept explicit.
  const { dev, build } = normalizeEntry(options.entry);
  return [devPlugin({ entry: dev }), buildConfigPlugin({ entry: build }), devVmodPlugin()];
}

// Reconcile the entry for dev (matched against the absolute module id via endsWith) and build
// (fed to rolldownOptions.input). Anything already ROOTED passes through unchanged — a leading "/"
// (root-relative "/src/main.ts", a POSIX-absolute "/Users/x/…", or a UNC "//server/share/…") or a
// Windows drive-letter "C:/x": dev's endsWith matches the module id, and build accepts a "/"-input
// as root-relative and an absolute path as-is. Only the RELATIVE forms ("src/main.ts",
// "./src/main.ts") get a leading slash added for dev and the bare form for build. Backslashes are
// normalized to "/" first. (Stripping the slash off a POSIX/UNC absolute broke `vite build` with
// UNRESOLVED_ENTRY while dev still worked.)
function normalizeEntry(entry?: string): { dev: string; build: string } {
  const e = (entry ?? "src/main.ts").replace(/\\/g, "/");
  if (e.startsWith("/") || /^[a-zA-Z]:\//.test(e)) return { dev: e, build: e };
  const bare = e.replace(/^(?:\.\/)+/, "");
  return { dev: `/${bare}`, build: bare };
}

export default vueTui;
