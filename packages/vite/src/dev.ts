import type { Plugin } from "vite";
import { isRunnableDevEnvironment } from "vite";
import { bridgeHmrEventsToRunner } from "./bridge-hmr.ts";
import { DEV_VMOD_ID } from "./dev-vmod.ts";

export function devPlugin(opts: { entry?: string }): Plugin {
  const entry = opts.entry ?? "/src/main.ts";
  return {
    name: "vue-tui:dev",
    apply: "serve",
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
      const path = id.split("?")[0];
      if (path.endsWith(entry)) {
        return { code: `import ${JSON.stringify(DEV_VMOD_ID)};\n` + code, map: null };
      }
    },
    configureServer(server) {
      bridgeHmrEventsToRunner(server);
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
