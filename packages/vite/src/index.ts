import type { Plugin } from "vite";
import { devVmodPlugin } from "./dev-vmod.ts";
import { devPlugin } from "./dev.ts";

export interface VueTuiOptions {
  entry?: string;
}

export function vueTui(options: VueTuiOptions = {}): Plugin[] {
  // vueTui() is a DEV-only toolkit: an in-terminal dev server with HMR. It does NOT touch the
  // production build — `vite build` is browser-first and the wrong tool for a Node program. Bundle
  // the app into a self-contained Node file with tsdown + unplugin-vue instead (see the
  // vue-tui-starter template and examples/*/tsdown.config.ts).
  //
  // Bring your own SFC/JSX compiler alongside vueTui() — `[vue(), vueTui()]` for SFCs, or
  // `[vueJsx(), vueTui()]` for JSX. devPlugin's configResolved finds whichever is present (by
  // plugin name) and force-client-compiles it, so it emits CLIENT render functions for the
  // terminal renderer even in Vite's SSR dev environment. vueTui deliberately does NOT bundle
  // @vitejs/plugin-vue: the app's authoring format is the consumer's choice, kept explicit.
  return [devPlugin({ entry: normalizeDevEntry(options.entry) }), devVmodPlugin()];
}

// Normalize the dev entry (matched against the absolute module id via endsWith). Anything already
// ROOTED passes through unchanged — a leading "/" (root-relative "/src/main.ts", a POSIX-absolute
// "/Users/x/…", or a UNC "//server/share/…") or a Windows drive-letter "C:/x". Only the RELATIVE
// forms ("src/main.ts", "./src/main.ts") get a leading slash added. Backslashes are normalized first.
function normalizeDevEntry(entry?: string): string {
  const e = (entry ?? "src/main.ts").replace(/\\/g, "/");
  if (e.startsWith("/") || /^[a-zA-Z]:\//.test(e)) return e;
  return `/${e.replace(/^(?:\.\/)+/, "")}`;
}

export default vueTui;
