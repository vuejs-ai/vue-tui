import type { Plugin } from "vite";
import { isRunnableDevEnvironment } from "vite";
import { bridgeHmrEventsToRunner } from "./bridge-hmr.ts";
import { DEV_VMOD_ID } from "./dev-vmod.ts";
import { forceClientCompile } from "./force-client-compile.ts";

export function devPlugin(opts: { entry?: string }): Plugin {
  const entry = opts.entry ?? "/src/main.ts";
  return {
    name: "vue-tui:dev",
    apply: "serve",
    configResolved(config) {
      // The app runs in Vite's SSR runnable environment but renders with the CLIENT
      // (terminal) renderer, so the Vue compilers must emit CLIENT render functions, not
      // SSR output. Force-client-compile our own plugin-vue AND any plugin-vue /
      // plugin-vue-jsx the user added alongside vueTui() (e.g. @vitejs/plugin-vue-jsx for
      // .tsx); otherwise those compile in SSR mode and the terminal renderer — which is a
      // client renderer — gets SSR-shaped output and paints a blank frame (no error).
      for (const p of config.plugins) {
        if (p.name === "vite:vue" || p.name === "vite:vue-jsx") forceClientCompile(p);
      }
    },
    config() {
      // Terminal renderer owns the screen; keep Vite quiet and skip the browser HMR
      // socket (HMR flows through the module runner's in-process channel instead).
      return { clearScreen: false, logLevel: "error", server: { ws: false } };
    },
    transform(code, id) {
      // Inject the dev connector at the TOP of the configured entry (a transformed
      // module → its import.meta.hot is live). Runs before createApp().mount(), so
      // isDevConnected() is already true when the overlay gate is checked. `id` is an
      // ABSOLUTE fs path while `entry` is root-relative (starts with "/"), so endsWith
      // matches both the default and a custom entry — and must inject into exactly the
      // entry that configureServer's runner.import(entry) loads, nothing else.
      const q = id.indexOf("?");
      const path = q === -1 ? id : id.slice(0, q);
      if (path.endsWith(entry)) {
        return { code: `import ${JSON.stringify(DEV_VMOD_ID)};\n` + code, map: null };
      }
    },
    configureServer(server) {
      // The in-process TUI owns process.stdin (raw mode). Vite's CLI keyboard shortcuts
      // (q=quit, r=restart, …) attach their own readline 'line' listener to process.stdin, so a
      // submitted "q"/"r"/… line would run a dev-server action out from under the running app
      // (q = server.close()). Neutralize them — the terminal app, not the CLI, owns the keys.
      server.bindCLIShortcuts = () => {};
      bridgeHmrEventsToRunner(server);
      // App-exit → server teardown. The app runs in-process, so the dev server
      // holds the event loop open (ports, watchers, the module runner). When the
      // app genuinely exits (useApp().exit(), waitUntilExit() drain, error exit)
      // the runtime calls this global; close the server so the process can exit
      // cleanly instead of hanging on the still-open server. A full reload does
      // NOT settle the app's exit promise, so it never reaches here — only a real
      // exit does. (No re-import handler is needed for full reloads: Vite's SSR
      // runner auto-re-imports the entry, and the runtime unmounts the old app on
      // vite:beforeFullReload — verified by run.)
      (globalThis as { __VUE_TUI_TEARDOWN__?: () => void }).__VUE_TUI_TEARDOWN__ = () => {
        void server.close();
      };
      return () => {
        const env = server.environments.ssr;
        if (!isRunnableDevEnvironment(env)) {
          server.config.logger.error('[vue-tui] the "ssr" environment is not runnable');
          return;
        }
        void env.runner.import(entry).catch((err: unknown) => {
          server.config.logger.error(`[vue-tui] failed to launch ${entry}`);
          console.error(err);
        });
      };
    },
  };
}
