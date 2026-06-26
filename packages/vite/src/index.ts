export { forceClientCompile } from "./force-client-compile.ts";
export { bridgeHmrEventsToRunner } from "./bridge-hmr.ts";
export { isExternalId } from "./external.ts";
export { DEV_VMOD_ID, RESOLVED_DEV_VMOD_ID } from "./dev-vmod.ts";
export interface VueTuiOptions {
  vue?: import("@vitejs/plugin-vue").Options;
  entry?: string;
}
