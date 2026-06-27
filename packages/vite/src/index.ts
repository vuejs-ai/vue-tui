import vue from "@vitejs/plugin-vue";
import type { Plugin } from "vite";
import { devVmodPlugin } from "./dev-vmod.ts";
import { devPlugin } from "./dev.ts";
import { buildConfigPlugin } from "./build.ts";

export interface VueTuiOptions {
  vue?: Parameters<typeof vue>[0];
  entry?: string;
}

export function vueTui(options: VueTuiOptions = {}): Plugin[] {
  // devPlugin (apply:"serve") and buildConfigPlugin (apply:"build") never run together — Vite
  // picks the right set per mode. devPlugin wants a root-relative entry (leading "/", its
  // transform matches the absolute module id via endsWith); the build plugin feeds entry to
  // rollupOptions.input, which must have no leading slash. normalizeEntry() reconciles the two
  // so "/src/main.ts", "src/main.ts", and "./src/main.ts" all behave the same — a "./" entry
  // used to slip past dev's match (no dev module injected -> no HMR/overlay) while build
  // still succeeded.
  // plugin-vue here (and any plugin-vue-jsx the user adds) is force-client-compiled in
  // devPlugin's configResolved, so it runs in the SSR dev environment but emits CLIENT
  // render functions for the terminal renderer.
  const { dev, build } = normalizeEntry(options.entry);
  return [
    devPlugin({ entry: dev }),
    buildConfigPlugin({ entry: build }),
    devVmodPlugin(),
    vue(options.vue) as Plugin,
  ];
}

// Reconcile the entry for dev (matched against the absolute module id via endsWith, so it
// needs a leading slash) and build (fed bare to rollupOptions.input). "/x", "x", and "./x"
// collapse to the same pair. A Windows-absolute drive-letter entry ("C:/x" / "C:\\x") is left
// absolute — dev's endsWith matches the drive-letter module id, and prefixing "/" (-> "/C:/x")
// would never match.
function normalizeEntry(entry?: string): { dev: string; build: string } {
  const e = (entry ?? "src/main.ts").replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(e)) return { dev: e, build: e };
  const bare = e.replace(/^(?:\.?\/)+/, "");
  return { dev: `/${bare}`, build: bare };
}

export default vueTui;
