import { type InjectionKey, shallowRef, type ShallowRef } from "vue";

export interface DevErrorInfo {
  message: string;
  stack?: string;
  loc?: { file: string; line: number; column: number };
}

export type DevState =
  | { type: "ok" }
  | { type: "error"; error: DevErrorInfo }
  | { type: "update"; paths: string[] };

export const DevStateKey: InjectionKey<ShallowRef<DevState>> = Symbol("DevState");

export const devState = shallowRef<DevState>({ type: "ok" });

// The minimal Vite HMR context shape we use. Declared STRUCTURALLY (not derived
// from ImportMeta["hot"]) so this module type-checks even when imported from a
// package whose tsconfig doesn't pick up env.d.ts's ambient augmentation — e.g.
// runtime-tests imports ../runtime/src/hmr.ts directly. Keep it in sync with the
// ImportMeta.hot declaration in env.d.ts.
interface HotContext {
  on(event: string, cb: (payload: unknown) => void): void;
  send(event: string, data?: unknown): void;
}

// Typed access to import.meta.hot relies on env.d.ts's ambient augmentation,
// which isn't visible to every importing package; read it through a structural
// cast so the default param below type-checks anywhere this module is imported.
const realHot = (import.meta as { hot?: HotContext }).hot;

// Register listeners once PER hot context, not once per process. connectDevtools()
// is the sole caller (the injected dev module calls it with import.meta.hot); on a
// full reload Vite re-executes that module and hands us a NEW hot whose constructor
// already stripped the previous hot's listeners, so we must re-arm the new one.
// A process-lifetime flag would break this on the DEFAULT published install: a real
// `npm install` puts @vue-tui/runtime in node_modules, which Vite's SSR runner
// EXTERNALIZES, so this module's globals persist across reloads — the flag would
// stay set and skip re-registration, leaving the bridge dead after the first reload
// (overlay + reload-teardown silently stop, and the next reload leaks a zombie app).
// The monorepo bundles the runtime (workspace real-path outside node_modules), so it
// re-executes each reload and a flag would reset — which is exactly why the bundled
// test path can't catch this. Tracking hot identity re-arms each new hot while still
// ignoring a redundant re-call on the SAME hot (Vite appends listeners with no dedup,
// so re-registering the same hot would double-fire every event).
let bridgedHot: HotContext | undefined;

// Teardown of the dev app currently mounted in this process. In dev an
// entry-level edit that Vite can't hot-accept emits a FULL RELOAD: Vite's SSR
// module runner re-executes the entry, which calls createApp().mount() again.
// The old app must be unmounted FIRST — otherwise mount()'s instance-reuse
// guard rejects the new app (the reload silently no-ops) and the old app's
// renderer, timers and stdout writes leak as a zombie writing over the new one.
// render.ts registers the active app here on mount and clears it on unmount;
// the vite:beforeFullReload handler below runs it just before the runner
// re-imports the entry. Verified by a real run: beforeFullReload fires BEFORE
// the re-import, and the runner auto-re-imports the entry, so we tear down here
// and let Vite do the re-import (no manual re-import). Crucially this tears down
// WITHOUT settling the app's exit promise, so a reload is never mistaken for a
// genuine app exit (which is what triggers the dev-server-close hook).
let currentDevAppTeardown: (() => void) | undefined;

export function registerDevApp(teardown: () => void): void {
  currentDevAppTeardown = teardown;
}

export function unregisterDevApp(teardown: () => void): void {
  // Identity-guard the clear: during a reload the old app's teardown runs and
  // unregisters before the new app registers, so a stale teardown can never
  // wipe a newer app's registration.
  if (currentDevAppTeardown === teardown) currentDevAppTeardown = undefined;
}

// Handle for the pending "update → ok" reset. At most ONE may be live at a time:
// rapid successive updates would otherwise STACK independent timers, and an
// earlier update's timer firing while a later update is still showing would wipe
// the newer status line early (its guard only checks type === "update", which is
// still true for the newer update). We therefore clear the previous timer before
// scheduling a new one. setTimeout's return type differs (number in DOM,
// Timeout in Node), so use ReturnType<typeof setTimeout>.
let pendingResetTimer: ReturnType<typeof setTimeout> | undefined;

// `hot` is injectable (defaulting to the real import.meta.hot) purely for tests:
// import.meta.hot is undefined under vitest, so the body is otherwise unreachable.
export function initHmrBridge(hot: HotContext | undefined = realHot): void {
  if (!hot) return;
  if (hot === bridgedHot) return;
  bridgedHot = hot;

  hot.on("vite:error", (payload: unknown) => {
    // An error supersedes any pending update → ok reset; clear it so a stale
    // timer can't later overwrite the error status with "ok".
    if (pendingResetTimer !== undefined) {
      clearTimeout(pendingResetTimer);
      pendingResetTimer = undefined;
    }
    const p = payload as { err: DevErrorInfo };
    devState.value = { type: "error", error: p.err };
  });

  hot.on("vite:beforeUpdate", (payload: unknown) => {
    // Cancel the previous update's reset so only the LATEST update's timer is
    // live — otherwise a stacked earlier timer resets this newer status early.
    if (pendingResetTimer !== undefined) {
      clearTimeout(pendingResetTimer);
      pendingResetTimer = undefined;
    }
    const p = payload as { updates: Array<{ path: string }> };
    devState.value = {
      type: "update",
      paths: p.updates.map((u) => u.path),
    };
    const timer = setTimeout(() => {
      pendingResetTimer = undefined;
      if (devState.value.type === "update") {
        devState.value = { type: "ok" };
      }
    }, 2000);
    pendingResetTimer = timer;
    // Don't hold the event loop open for a transient status reset. .unref() only
    // exists on Node's Timeout (not the DOM number), so call it optionally.
    timer.unref?.();
  });

  hot.on("vite:beforeFullReload", () => {
    // Unmount the current app before the module runner re-executes the entry, so
    // the fresh createApp().mount() isn't blocked by the instance-reuse guard and
    // the old renderer/timers don't leak. The runner auto-re-imports the entry on
    // full reload (verified by run), so we do NOT re-import here.
    currentDevAppTeardown?.();
    currentDevAppTeardown = undefined;
    // Retained for the documented dev protocol/observability. In-process there is
    // no child to restart, so nothing consumes this today; the teardown above plus
    // Vite's auto re-import are what actually perform the reload.
    hot.send("vue-tui:request-reload");
  });
}

// Whether the dev integration has been connected. createApp() reads this to
// decide whether to install the dev
// overlay. Set by connectDevtools(), which @vue-tui/vite calls (via an injected
// transformed module) with a LIVE import.meta.hot — the runtime is externalized in
// dev, so its own import.meta.hot is undefined and cannot drive the bridge.
let devConnected = false;
export function isDevConnected(): boolean {
  return devConnected;
}

// Public dev entry point for @vue-tui/vite (exposed via @vue-tui/runtime/internal/devtools).
// Hands a live Vite hot context to the HMR bridge and flips the dev flag.
export function connectDevtools(hot: HotContext): void {
  devConnected = true;
  initHmrBridge(hot);
}

// Signal the @vue-tui/vite dev plugin that the app has GENUINELY exited
// (useApp().exit(), waitUntilExit() drain, error exit) so it can close the dev
// server that holds the event loop open. Sent over the SAME in-process hot channel
// as the rest of the dev bridge — no process-global. A full reload tears down via
// the beforeFullReload handler WITHOUT settling the exit promise, so this only
// fires on a real exit. No-ops when dev isn't connected (bridgedHot is undefined).
export function notifyDevExit(): void {
  bridgedHot?.send("vue-tui:exit");
}

// Reset the shared dev status to "ok". `devState` is a module-global that a
// PREVIOUS app in the same dev process may have left in an error/update state
// (createApp() can run multiple times: two apps, unmount + re-create, a tool
// that restarts the UI, a test run). Nothing else clears it on the create path,
// so without this a freshly-mounted app injects the stale state and renders the
// old "Build Error" / "[HMR] updated" overlay instead of its own content.
// render()'s dev block calls this once per app setup via the isDevConnected()
// gate. We don't touch `pendingResetTimer` here: its firing is guarded on
// `type === "update"`,
// which this reset clears, and the vite:beforeUpdate handler clears any prior
// timer before arming a new one — so a stale timer can't clobber a later app.
export function resetDevState(): void {
  devState.value = { type: "ok" };
}
