export { forceClientCompile } from "./force-client-compile.ts";
export { bridgeHmrEventsToRunner } from "./bridge-hmr.ts";
export interface VueTuiOptions {
  vue?: import("@vitejs/plugin-vue").Options;
  entry?: string;
}
