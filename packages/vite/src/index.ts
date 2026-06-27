import vue from "@vitejs/plugin-vue";
import type { Plugin } from "vite";
import { forceClientCompile } from "./force-client-compile.ts";
import { devVmodPlugin } from "./dev-vmod.ts";
import { devPlugin } from "./dev.ts";
import { buildConfigPlugin } from "./build.ts";

export interface VueTuiOptions {
  vue?: Parameters<typeof vue>[0];
  entry?: string;
}

export function vueTui(options: VueTuiOptions = {}): Plugin[] {
  const vuePlugin = vue(options.vue) as Plugin;
  forceClientCompile(vuePlugin);
  // devPlugin (apply:"serve") and buildConfigPlugin (apply:"build") never run together — Vite
  // picks the right set per mode. devPlugin wants a root-relative entry (leading "/"); the build
  // plugin feeds entry to rollupOptions.input, which must be a path with no leading slash.
  return [
    devPlugin({ entry: options.entry }),
    buildConfigPlugin({ entry: stripLeadingSlash(options.entry) }),
    devVmodPlugin(),
    vuePlugin,
  ];
}

function stripLeadingSlash(p?: string): string | undefined {
  return p?.replace(/^\//, "");
}

export default vueTui;
