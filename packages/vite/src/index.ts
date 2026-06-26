import vue from "@vitejs/plugin-vue";
import type { Plugin } from "vite";
import { forceClientCompile } from "./force-client-compile.ts";
import { bridgeHmrEventsToRunner } from "./bridge-hmr.ts";
import { isExternalId } from "./external.ts";
import { devVmodPlugin, DEV_VMOD_ID, RESOLVED_DEV_VMOD_ID } from "./dev-vmod.ts";
import { devPlugin } from "./dev.ts";

export interface VueTuiOptions {
  vue?: Parameters<typeof vue>[0];
  entry?: string;
}

export function vueTui(options: VueTuiOptions = {}): Plugin[] {
  const vuePlugin = vue(options.vue) as Plugin;
  forceClientCompile(vuePlugin);
  return [devPlugin({ entry: options.entry }), devVmodPlugin(), vuePlugin];
}

export default vueTui;
export { forceClientCompile, bridgeHmrEventsToRunner, isExternalId };
export { DEV_VMOD_ID, RESOLVED_DEV_VMOD_ID };
