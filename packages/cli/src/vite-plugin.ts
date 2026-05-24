import type { Plugin } from "vite";

export interface VueTuiDevPluginOptions {
  entry?: string;
}

export function vueTuiDevPlugin(options?: VueTuiDevPluginOptions): Plugin {
  return {
    name: "vue-tui:dev",
    config() {
      return {
        experimental: { bundledDev: true },
        build: {
          modulePreload: false,
          ...(options?.entry ? { lib: { entry: options.entry } } : {}),
        },
        define: {
          __VUE_TUI_DEV__: "true",
        },
        resolve: {
          conditions: ["node"],
        },
        server: {
          strictPort: true,
        },
      };
    },
  };
}
