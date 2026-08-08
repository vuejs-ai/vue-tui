import type { Plugin } from "vite";
import { randomUUID } from "node:crypto";
import { buildPlugin } from "./build.ts";
import { devVmodPlugin } from "./dev-vmod.ts";
import { devPlugin } from "./dev.ts";
import { hmrErrorForwardingPlugin } from "./hmr-error-forwarding.ts";
import { createWatcherUpdateTracker } from "./watcher-update.ts";

export function vueTui(): Plugin[] {
  if (arguments.length > 0) {
    const error = new Error(
      "[vue-tui] vueTui() no longer accepts an entry option. Set Vite's top-level input instead.",
    );
    error.name = "VueTuiInvalidOptionsError";
    throw error;
  }
  // vueTui() supplies production defaults for standalone applications and an in-terminal
  // development server with HMR. Embedded applications use @vue-tui/runtime without this plugin
  // and keep their host build.
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
    buildPlugin(),
    hmrErrorForwardingPlugin({ watcherUpdates }),
    devPlugin({ session, watcherUpdates }),
    devVmodPlugin(session),
  ];
}

export default vueTui;
