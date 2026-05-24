import type { Plugin } from "vite";
import { builtinModules } from "node:module";

export interface VueTuiDevPluginOptions {
  entry?: string;
}

const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

export function vueTuiDevPlugin(_options?: VueTuiDevPluginOptions): Plugin[] {
  return [
    {
      name: "vue-tui:node-builtins",
      enforce: "pre",
      resolveId(id) {
        if (nodeBuiltins.has(id)) {
          return { id: id.startsWith("node:") ? id : `node:${id}`, external: true };
        }
      },
    },
    {
      name: "vue-tui:dev",
      config(config) {
        // bundledDev uses index.html as entry, not build.lib
        if (config.build?.lib) {
          config.build.lib = undefined;
        }
        // bundledDev bundles everything — strip user's external config
        if (config.build?.rollupOptions) {
          config.build.rollupOptions.external = undefined;
        }

        return {
          experimental: { bundledDev: true },
          build: {
            modulePreload: false,
          },
          define: {
            __VUE_TUI_DEV__: "true",
          },
          server: {
            strictPort: true,
          },
        };
      },
    },
  ];
}
