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

// Shared across Runtime module copies so the overlay (provided from createApp) and
// HMR handlers (wired by connectDevtools) observe the same status ref.
const DEV_STATE_KEY = "__vue_tui_dev_state_ref__";
function sharedDevState(): ShallowRef<DevState> {
  const g = globalThis as typeof globalThis & {
    [DEV_STATE_KEY]?: ShallowRef<DevState>;
  };
  if (!g[DEV_STATE_KEY]) {
    g[DEV_STATE_KEY] = shallowRef<DevState>({ type: "ok" });
  }
  return g[DEV_STATE_KEY];
}
export const devState = sharedDevState();

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

// Process-wide privileged bridge state. Kept on globalThis so every Runtime copy
// in the process (externalized Node resolution, Vitest-transformed source, and a
// monorepo-bundled SSR graph) shares one session: connectDevtools in the app, and
// disconnectDevtools from @vue-tui/vite's close hook, must see the same owners.
// Module-local `let` would silently fork under those graphs and leak the app.
const GLOBAL_KEY = "__vue_tui_devtools_bridge__";

interface DevtoolsBridgeState {
  bridgedHot: HotContext | undefined;
  activeSessionId: string | undefined;
  currentDevApp: DevAppLifecycle | undefined;
  pendingResetTimer: ReturnType<typeof setTimeout> | undefined;
  devConnected: boolean;
}

interface DevAppLifecycle {
  /** Replace this app during a Vite full reload without settling application exit. */
  replace(): void;
  /** End this app because its owning Vite dev session is closing. */
  close(): void | Promise<void>;
}

function bridge(): DevtoolsBridgeState {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: DevtoolsBridgeState;
  };
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      bridgedHot: undefined,
      activeSessionId: undefined,
      currentDevApp: undefined,
      pendingResetTimer: undefined,
      devConnected: false,
    };
  }
  return g[GLOBAL_KEY];
}

// Register listeners once PER hot context, not once per process. connectDevtools()
// is the sole caller (the injected dev module calls it with import.meta.hot); on a
// full reload Vite re-executes that module and hands us a NEW hot whose constructor
// already stripped the previous hot's listeners, so we must re-arm the new one.
// Tracking hot identity re-arms each new hot while still ignoring a redundant
// re-call on the SAME hot (Vite appends listeners with no dedup, so re-registering
// the same hot would double-fire every event). Process-global storage keeps this
// correct when Runtime is externalized (published install and forced monorepo path).

export function registerDevApp(app: DevAppLifecycle): void {
  const state = bridge();
  if (state.currentDevApp !== undefined && state.currentDevApp !== app) {
    throw new Error("[vue-tui] only one mounted app may use the active Vite dev session at a time");
  }
  state.currentDevApp = app;
}

export function unregisterDevApp(app: DevAppLifecycle): void {
  // Identity-guard the clear: during a reload the old app's teardown runs and
  // unregisters before the new app registers, so a stale teardown can never
  // wipe a newer app's registration.
  const state = bridge();
  if (state.currentDevApp === app) state.currentDevApp = undefined;
}

function clearPendingResetTimer(): void {
  const state = bridge();
  if (state.pendingResetTimer === undefined) return;
  clearTimeout(state.pendingResetTimer);
  state.pendingResetTimer = undefined;
}

// `hot` is injectable (defaulting to the real import.meta.hot) purely for tests:
// import.meta.hot is undefined under vitest, so the body is otherwise unreachable.
export function initHmrBridge(hot: HotContext | undefined = realHot): void {
  if (!hot) return;
  const state = bridge();
  if (hot === state.bridgedHot) return;
  state.bridgedHot = hot;

  let failedUpdateTimestamp: number | undefined;
  let latestSettledTimestamp: number | undefined;
  let pendingUpdate:
    | {
        paths: string[];
        failed: boolean;
        stale: boolean;
        timestamp: number | undefined;
      }
    | undefined;

  hot.on("vue-tui:hmr-error-context", (payload: unknown) => {
    const p = payload as { timestamp: number };
    failedUpdateTimestamp = p.timestamp;
  });

  hot.on("vite:error", (payload: unknown) => {
    // Vite can finish a newer watcher task before an older async compiler task
    // reports its error. Do not let that late error replace the already-applied
    // newer result.
    if (
      failedUpdateTimestamp !== undefined &&
      latestSettledTimestamp !== undefined &&
      failedUpdateTimestamp < latestSettledTimestamp
    ) {
      failedUpdateTimestamp = undefined;
      return;
    }

    // An error supersedes any pending update → ok reset; clear it so a stale
    // timer can't later overwrite the error status with "ok".
    clearPendingResetTimer();
    pendingUpdate = undefined;
    if (failedUpdateTimestamp !== undefined) {
      latestSettledTimestamp = failedUpdateTimestamp;
    }
    const p = payload as { err: DevErrorInfo };
    devState.value = { type: "error", error: p.err };
  });

  hot.on("vite:beforeUpdate", (payload: unknown) => {
    // Beginning an update is not proof that it succeeded. Keep any current
    // error visible until Vite emits afterUpdate for this batch.
    const p = payload as { updates: Array<{ path: string; timestamp?: number }> };
    const timestamps = p.updates.flatMap((update) =>
      update.timestamp === undefined ? [] : [update.timestamp],
    );
    const timestamp = timestamps.length === 0 ? undefined : Math.max(...timestamps);
    const stale =
      timestamp !== undefined &&
      latestSettledTimestamp !== undefined &&
      timestamp < latestSettledTimestamp;
    // An older batch cannot replace the current status, so it also must not
    // cancel that status's pending reset.
    if (!stale) clearPendingResetTimer();
    const failed =
      failedUpdateTimestamp !== undefined &&
      p.updates.some((update) => update.timestamp === failedUpdateTimestamp);
    pendingUpdate = {
      paths: p.updates.map((u) => u.path),
      failed,
      stale,
      timestamp,
    };
  });

  hot.on("vite:afterUpdate", () => {
    const update = pendingUpdate;
    pendingUpdate = undefined;
    if (!update || update.failed || update.stale) return;
    if (update.timestamp !== undefined) {
      latestSettledTimestamp = update.timestamp;
    }
    // A successful later update supersedes any previously failed batch. Older
    // successes returned above, so they cannot clear a newer failure.
    failedUpdateTimestamp = undefined;
    devState.value = {
      type: "update",
      paths: update.paths,
    };
    const timer = setTimeout(() => {
      const live = bridge();
      live.pendingResetTimer = undefined;
      if (devState.value.type === "update") {
        devState.value = { type: "ok" };
      }
    }, 2000);
    state.pendingResetTimer = timer;
    // Don't hold the event loop open for a transient status reset. .unref() only
    // exists on Node's Timeout (not the DOM number), so call it optionally.
    timer.unref?.();
  });

  hot.on("vite:beforeFullReload", () => {
    // Unmount the current app before the module runner re-executes the entry, so
    // the fresh createApp().mount() isn't blocked by the instance-reuse guard and
    // the old renderer/timers don't leak. The runner auto-re-imports the entry on
    // full reload (verified by run), so we do NOT re-import here. There is no
    // separate vue-tui:request-reload event — nothing consumed it.
    clearPendingResetTimer();
    pendingUpdate = undefined;
    failedUpdateTimestamp = undefined;
    const live = bridge();
    const app = live.currentDevApp;
    live.currentDevApp = undefined;
    app?.replace();
  });
}

// Whether the dev integration has been connected. createApp() reads this to
// decide whether to install the dev overlay. Set by connectDevtools(), which
// @vue-tui/vite calls (via an injected transformed module) with a LIVE
// import.meta.hot — the runtime is externalized in dev, so its own import.meta.hot
// is undefined and cannot drive the bridge.
export function isDevConnected(): boolean {
  return bridge().devConnected;
}

/** Active privileged Vite session id, if any. Test and plugin introspection only. */
export function getDevtoolsSessionId(): string | undefined {
  return bridge().activeSessionId;
}

/** Whether a pending update→ok timer is still armed. Test introspection only. */
export function hasPendingDevResetTimer(): boolean {
  return bridge().pendingResetTimer !== undefined;
}

export interface ConnectDevtoolsOptions {
  /**
   * Stable identity of the Vite dev session that owns this connection.
   * Full reload of the same server reuses the same id with a fresh hot context.
   * A different id while a session is already active fails deterministically.
   */
  sessionId?: string;
}

// Privileged dev entry point for @vue-tui/vite (exposed via @vue-tui/runtime/internal/devtools).
// Hands a live Vite hot context to the HMR bridge and flips the dev flag.
export function connectDevtools(hot: HotContext, options?: ConnectDevtoolsOptions): void {
  const sessionId = options?.sessionId;
  const state = bridge();
  if (state.activeSessionId !== undefined && sessionId !== state.activeSessionId) {
    throw new Error(
      "[vue-tui] another Vite dev session is already active in this process; close it before starting a new one",
    );
  }
  if (sessionId !== undefined) {
    state.activeSessionId = sessionId;
  }
  state.devConnected = true;
  initHmrBridge(hot);
}

/**
 * Tear down the active Vite dev session owned by `sessionId` (or the only active
 * session when omitted). Identity-guarded and idempotent: a mismatched id is a
 * no-op; a second call after a successful disconnect is a no-op.
 *
 * Ends the mounted dev app and settles its exit, clears pending dev-status
 * timers, and drops the hot bridge so a later sequential session can connect.
 */
export function disconnectDevtools(sessionId?: string): void | Promise<void> {
  const state = bridge();
  if (
    sessionId !== undefined &&
    state.activeSessionId !== undefined &&
    state.activeSessionId !== sessionId
  ) {
    return;
  }
  if (
    !state.devConnected &&
    state.currentDevApp === undefined &&
    state.bridgedHot === undefined &&
    state.pendingResetTimer === undefined &&
    state.activeSessionId === undefined
  ) {
    return;
  }

  clearPendingResetTimer();

  const app = state.currentDevApp;
  state.currentDevApp = undefined;
  // Disconnect the hot channel BEFORE normal app exit settles. Its exit-finally
  // notification then becomes a no-op instead of re-entering server.close().
  state.bridgedHot = undefined;
  state.devConnected = false;
  state.activeSessionId = undefined;
  devState.value = { type: "ok" };
  return app?.close();
}

// Signal the @vue-tui/vite dev plugin that the app has GENUINELY exited
// (useApp().exit(), waitUntilExit() drain, error exit) so it can close the dev
// server that holds the event loop open. Sent over the SAME in-process hot channel
// as the rest of the dev bridge. A full reload tears down via the beforeFullReload
// handler WITHOUT settling the exit promise, so this only fires on a real exit.
// No-ops when dev isn't connected (bridgedHot is undefined).
export function notifyDevExit(): void {
  bridge().bridgedHot?.send("vue-tui:exit");
}

// Reset the shared dev status to "ok". `devState` is a module-global that a
// PREVIOUS app in the same dev process may have left in an error/update state
// (createApp() can run multiple times: two apps, unmount + re-create, a tool
// that restarts the UI, a test run). Nothing else clears it on the create path,
// so without this a freshly-mounted app injects the stale state and renders the
// old "Build Error" / "[HMR] updated" overlay instead of its own content.
// render()'s dev block calls this once per app setup via the isDevConnected()
// gate. We don't touch `pendingResetTimer` here: its firing is guarded on
// `type === "update"`, which this reset clears, and the vite:beforeUpdate handler
// clears any prior timer before arming a new one — so a stale timer can't clobber
// a later app. (disconnectDevtools clears the timer explicitly when the session ends.)
export function resetDevState(): void {
  devState.value = { type: "ok" };
}
