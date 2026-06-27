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
  const entry = normalizeEntry(options.entry);
  return [
    devPlugin({ entry: `/${entry}` }),
    buildConfigPlugin({ entry }),
    devVmodPlugin(),
    vue(options.vue) as Plugin,
  ];
}

// Accept "/src/main.ts", "src/main.ts", or "./src/main.ts" interchangeably; return the bare
// root-relative form. dev re-adds the leading slash, build uses the bare form as-is.
function normalizeEntry(entry?: string): string {
  return (entry ?? "src/main.ts").replace(/^(?:\.?\/)+/, "");
}

export default vueTui;
