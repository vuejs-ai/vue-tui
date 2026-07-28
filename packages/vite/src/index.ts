import type { Plugin } from "vite";
import { randomUUID } from "node:crypto";
import { normalizeDevEntry } from "./entry-match.ts";
import { devVmodPlugin } from "./dev-vmod.ts";
import { devPlugin } from "./dev.ts";
import { hmrErrorForwardingPlugin } from "./hmr-error-forwarding.ts";
import { createWatcherUpdateTracker } from "./watcher-update.ts";

export interface VueTuiOptions {
  entry?: string;
}

export function vueTui(options: VueTuiOptions = {}): Plugin[] {
  // vueTui() is a DEV-only toolkit: an in-terminal dev server with HMR. It does NOT touch the
  // production build — `vite build` is browser-first and the wrong tool for a Node program. Bundle
  // the app into a self-contained Node file with tsdown + unplugin-vue instead (see the
  // templates/vite and examples/*/tsdown.config.ts).
  //
  // Bring your own compiler alongside vueTui() — `[vueSfc(), vueTui()]` from
  // unplugin-vue/vite for SFCs, or `[vueJsx(), vueTui()]` from
  // @vitejs/plugin-vue-jsx for JSX. unplugin-vue has a supported client-output
  // option and defaults it on. The JSX compiler does not, so devPlugin narrowly
  // supplies its missing client-mode hook argument. Exact peer pins and real
  // compilation journeys define the supported compiler matrix; generated output
  // is deliberately not pattern-matched. The authoring format stays explicit
  // instead of being bundled into vueTui().
  //
  // One session id is shared by the entry injector and the virtual dev module so full reload
  // reconnects the same privileged Runtime session while a concurrent second server fails.
  const session = { sessionId: randomUUID() };
  const watcherUpdates = createWatcherUpdateTracker();
  return [
    hmrErrorForwardingPlugin({ watcherUpdates }),
    devPlugin({ entry: normalizeDevEntry(options.entry), session, watcherUpdates }),
    devVmodPlugin(session),
  ];
}

export default vueTui;
