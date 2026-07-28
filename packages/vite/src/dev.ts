import { AsyncLocalStorage } from "node:async_hooks";
import type { Plugin, ViteDevServer } from "vite";
import { isRunnableDevEnvironment } from "vite";
import {
  disconnectDevtools,
  isVueTuiDevSessionConflictError,
} from "@vue-tui/runtime/internal/devtools";
import { bridgeHmrEventsToRunner } from "./bridge-hmr.ts";
import { DEV_VMOD_ID } from "./dev-vmod.ts";
import type { DevSessionRef } from "./dev-vmod.ts";
import {
  claimDevSession,
  releaseDevSession,
  VueTuiDevSessionClaimCancelledError,
} from "./dev-session.ts";
import { forceVueJsxClientCompile } from "./force-vue-jsx-client-compile.ts";
import {
  moduleIdMatchesConfiguredEntry,
  normalizeDevEntry,
  resolveConfiguredEntry,
} from "./entry-match.ts";
import { createWatcherUpdateTracker, type WatcherUpdateTracker } from "./watcher-update.ts";

class UnsupportedVueCompilerError extends Error {
  override readonly name = "VueTuiUnsupportedCompilerError";
}

async function closeLosingServer(server: ViteDevServer, error: unknown): Promise<void> {
  console.error(error instanceof Error ? error.message : String(error));
  try {
    await server.close();
  } catch (closeError) {
    console.error(closeError);
  }
}

export function devPlugin(opts: {
  entry?: string;
  session: DevSessionRef;
  watcherUpdates?: WatcherUpdateTracker;
}): Plugin {
  // `entry` is the rooted form normalizeDevEntry() produced (leading "/" or a
  // drive-letter path). The SSR runner imports this id; transform matching uses
  // the absolute path resolved from config.root in configResolved.
  const entry = opts.entry ?? normalizeDevEntry();
  const session = opts.session;
  const watcherUpdates = opts.watcherUpdates ?? createWatcherUpdateTracker();
  let resolvedEntryAbs = entry;
  let preserveSymlinks = false;
  let closing = false;
  const updateTimestamp = new AsyncLocalStorage<number>();

  async function tearDownSession(): Promise<void> {
    if (closing) return;
    closing = true;
    // Identity-guarded and idempotent inside disconnectDevtools. It disconnects
    // the hot channel before settling app exit, so notifyDevExit cannot re-enter
    // close when this path was initiated by programmatic server.close().
    try {
      await disconnectDevtools(session.sessionId);
    } finally {
      releaseDevSession(session.sessionId);
    }
  }

  return {
    name: "vue-tui:dev",
    apply: "serve",
    configResolved(config) {
      preserveSymlinks = config.resolve.preserveSymlinks;
      resolvedEntryAbs = resolveConfiguredEntry(config.root, entry);
      // The terminal renderer needs client compiler output even though the app runs in
      // Vite's SSR environment. SFCs use unplugin-vue's supported client-mode option.
      // Fail known unsupported alternatives at config time instead of allowing a blank
      // frame or silently losing HMR.
      for (const p of config.plugins) {
        if (p.name === "vite:vue") {
          throw new UnsupportedVueCompilerError(
            "[vue-tui] @vitejs/plugin-vue cannot select client compiler output through a supported option. Replace it with unplugin-vue/vite before vueTui().",
          );
        }
        if (p.name === "unplugin-vue-jsx") {
          throw new UnsupportedVueCompilerError(
            "[vue-tui] unplugin-vue-jsx does not provide HMR. Use @vitejs/plugin-vue-jsx before vueTui().",
          );
        }
        if (
          p.name === "unplugin-vue" &&
          (p as { api?: { options?: { ssr?: unknown } } }).api?.options?.ssr === true
        ) {
          throw new UnsupportedVueCompilerError(
            "[vue-tui] unplugin-vue is configured with ssr: true, but vue-tui uses Vue's client renderer. Configure unplugin-vue/vite with ssr: false.",
          );
        }
      }
      // @vitejs/plugin-vue-jsx has HMR but no supported client-output option, so keep
      // the compatibility patch isolated to that compiler.
      for (const p of config.plugins) {
        if (p.name === "vite:vue-jsx") forceVueJsxClientCompile(p);
      }
    },
    config() {
      // Keep Vite errors enabled because some plugin and server failures have no HMR
      // payload for the Runtime overlay. The default Runtime console patch
      // coordinates those writes with the terminal frame; patchConsole: false is
      // the application's explicit escape from that protection.
      // Skip the browser HMR socket because HMR uses the in-process channel.
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
      if (moduleIdMatchesConfiguredEntry(id, resolvedEntryAbs, preserveSymlinks)) {
        return { code: `import ${JSON.stringify(DEV_VMOD_ID)};\n` + code, map: null };
      }
    },
    hotUpdate: {
      // Run before compilers: if the SFC compiler throws while analyzing the changed
      // SFC, the client error and SSR update still share this exact timestamp.
      order: "pre",
      handler(options) {
        // Vite may process watcher changes concurrently. Keep the timestamp on
        // this handleHMRUpdate async chain so an earlier error cannot inherit a
        // later file change's timestamp.
        updateTimestamp.enterWith(options.timestamp);
        watcherUpdates.observe(options);
      },
    },
    configureServer(server) {
      // The in-process TUI owns process.stdin (raw mode). Vite's CLI keyboard shortcuts
      // (q=quit, r=restart, …) attach their own readline 'line' listener to process.stdin, so a
      // submitted "q"/"r"/… line would run a dev-server action out from under the running app
      // (q = server.close()). Neutralize them — the terminal app, not the CLI, owns the keys.
      server.bindCLIShortcuts = () => {};
      bridgeHmrEventsToRunner(server, {
        getUpdateTimestamp: () => updateTimestamp.getStore(),
        preserveSymlinks,
        isDuplicateUpdate: (timestamp) => watcherUpdates.isDuplicate(timestamp),
      });

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
          console.error('[vue-tui] the "ssr" environment is not runnable');
          return;
        }
        // Ownership is claimed HERE, not in configureServer, and the claim is not
        // awaited by Vite. Both details are load-bearing. `restartServer` is
        // `_createServer` → `server.close()` → `listen()`, and configureServer
        // hooks — including this post hook — run inside `_createServer`. Awaiting
        // the handover any earlier deadlocks: the outgoing session only releases
        // during `server.close()`, which cannot run until `_createServer` returns.
        // Starting the chain and returning lets close proceed, the previous owner
        // let go, and this app mount into a terminal nobody else holds.
        void (async () => {
          try {
            await claimDevSession(session.sessionId);
          } catch (err) {
            // The server closed while this claim was queued. Its close path has
            // already released every resource; most importantly, cancellation is
            // not a successful claim followed by an import into a dead runner.
            if (err instanceof VueTuiDevSessionClaimCancelledError) return;
            // A second concurrent session must not survive losing. It cannot be
            // failed at creation — the claim is deliberately not awaited, because
            // awaiting it inside _createServer deadlocks every restart — so the
            // contract is honoured by closing it here instead of leaving a server
            // holding ports and watchers for an app that will never mount.
            await closeLosingServer(server, err);
            return;
          }
          // A close can race the microtask that resumes a successful claim. The
          // ownership module prevents a queued dead session from installing
          // itself; this closes the remaining one-turn window after installation.
          if (closing) {
            releaseDevSession(session.sessionId);
            return;
          }
          try {
            await env.runner.import(entry);
          } catch (err) {
            // The process-global Runtime bridge is a second ownership boundary.
            // It can still reject a mixed-version or otherwise independently
            // loaded plugin copy even after this package's claim succeeded. Such
            // a loser must release ports and watchers just like a rejected claim;
            // ordinary source-evaluation failures keep the server alive for HMR.
            if (isVueTuiDevSessionConflictError(err)) {
              await closeLosingServer(server, err);
              return;
            }
            console.error(`[vue-tui] failed to launch ${entry}`);
            console.error(err);
          }
        })();
      };
    },
  };
}

function wrapServerClose(server: ViteDevServer, onClose: () => void | Promise<void>): void {
  const originalClose = server.close.bind(server);
  server.close = (async () => {
    let teardownFailed = false;
    let teardownError: unknown;
    try {
      await onClose();
    } catch (error) {
      teardownFailed = true;
      teardownError = error;
    }

    try {
      await originalClose();
    } catch (closeError) {
      if (teardownFailed) {
        throw new AggregateError(
          [teardownError, closeError],
          "Failed to tear down both the vue-tui app and Vite dev server.",
        );
      }
      throw closeError;
    }
    if (teardownFailed) throw teardownError;
  }) as typeof server.close;
}
