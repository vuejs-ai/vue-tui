import type { Plugin, ViteDevServer } from "vite";
import { isRunnableDevEnvironment } from "vite";
import { disconnectDevtools } from "@vue-tui/runtime/internal/devtools";
import { bridgeHmrEventsToRunner } from "./bridge-hmr.ts";
import { DEV_VMOD_ID } from "./dev-vmod.ts";
import type { DevSessionRef } from "./dev-vmod.ts";
import { claimDevSession, releaseDevSession } from "./dev-session.ts";
import { forceClientCompile } from "./force-client-compile.ts";
import { moduleIdMatchesConfiguredEntry, resolveConfiguredEntry } from "./entry-match.ts";

export function devPlugin(opts: { entry?: string; session: DevSessionRef }): Plugin {
  // `entry` is the rooted form normalizeDevEntry() produced (leading "/" or a
  // drive-letter path). The SSR runner imports this id; transform matching uses
  // the absolute path resolved from config.root in configResolved.
  const entry = opts.entry ?? "/src/main.ts";
  const session = opts.session;
  let resolvedEntryAbs = entry;
  let closing = false;

  function tearDownSession(): void {
    if (closing) return;
    closing = true;
    // Identity-guarded and idempotent inside disconnectDevtools. App-driven exit
    // reaches here via server.close() after vue-tui:exit; disconnect uses the
    // abandon-exit teardown path so notifyDevExit cannot re-enter close.
    try {
      disconnectDevtools(session.sessionId);
    } finally {
      releaseDevSession(session.sessionId);
    }
  }

  return {
    name: "vue-tui:dev",
    apply: "serve",
    configResolved(config) {
      resolvedEntryAbs = resolveConfiguredEntry(config.root, entry);
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
      // Process-global session/devtools/resource state lives on globalThis inside
      // Runtime so a monorepo-bundled SSR graph and the plugin's Node-resolved copy
      // still share one session (published installs already externalize Runtime).
      return { clearScreen: false, logLevel: "error", server: { ws: false } };
    },
    transform(code, id) {
      // Inject the dev connector at the TOP of the configured entry (a transformed
      // module → its import.meta.hot is live). Runs before createApp().mount(), so
      // isDevConnected() is already true when the overlay gate is checked. Match the
      // absolute module path EXACTLY against the entry resolved from the Vite root —
      // never a suffix match that could hit an unrelated file ending in the same path.
      if (moduleIdMatchesConfiguredEntry(id, resolvedEntryAbs)) {
        return { code: `import ${JSON.stringify(DEV_VMOD_ID)};\n` + code, map: null };
      }
    },
    configureServer(server) {
      // Claim process ownership before the app mounts. A concurrent second server
      // fails here instead of overwriting process-global Runtime/plugin state.
      claimDevSession(session.sessionId);

      // The in-process TUI owns process.stdin (raw mode). Vite's CLI keyboard shortcuts
      // (q=quit, r=restart, …) attach their own readline 'line' listener to process.stdin, so a
      // submitted "q"/"r"/… line would run a dev-server action out from under the running app
      // (q = server.close()). Neutralize them — the terminal app, not the CLI, owns the keys.
      server.bindCLIShortcuts = () => {};
      bridgeHmrEventsToRunner(server);

      // Programmatic and app-driven server.close() both tear down the session.
      // Identity-guarded: only this plugin instance's session is released.
      wrapServerClose(server, tearDownSession);

      // App-exit → server teardown. The app runs in-process, so the dev server
      // holds the event loop open (ports, watchers, the module runner). When the
      // app genuinely exits (useApp().exit(), waitUntilExit() drain, error exit)
      // the runtime emits "vue-tui:exit" over the in-process hot channel; close the
      // server so the process can exit cleanly instead of hanging on the still-open
      // server. A full reload does NOT settle the app's exit promise, so it never
      // emits this — only a real exit does. (No re-import handler is needed for full
      // reloads: Vite's SSR runner auto-re-imports the entry, and the runtime
      // unmounts the old app on vite:beforeFullReload — verified by run.)
      server.environments.ssr?.hot.on("vue-tui:exit", () => {
        void server.close();
      });
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

function wrapServerClose(server: ViteDevServer, onClose: () => void): void {
  const originalClose = server.close.bind(server);
  server.close = (async () => {
    onClose();
    return originalClose();
  }) as typeof server.close;
}
