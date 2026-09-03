import { type InjectionKey, shallowRef, type ShallowRef } from "vue";
import { emitTestEvent, RUNTIME_TEST_EVENT } from "../session/test-events.ts";
import { DevSession } from "./session.ts";

export interface DevErrorInfo {
  message: string;
  stack?: string;
  loc?: { file: string; line: number; column: number };
  phase?: "compile" | "evaluate" | "render";
}

export type DevState =
  | { type: "ok" }
  | { type: "error"; error: DevErrorInfo }
  | { type: "update"; paths: string[] };

export const DevStateKey: InjectionKey<ShallowRef<DevState>> = Symbol("DevState");

// Shared across Runtime module copies so the overlay (provided by the development app factory) and
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
// package whose tsconfig doesn't pick up env.d.ts's ambient augmentation. Keep
// it in sync with the ImportMeta.hot declaration in env.d.ts.
interface HotContext {
  on(event: string, cb: (payload: unknown) => void): void;
  send(event: string, data?: unknown): void;
}

// Typed access to import.meta.hot relies on env.d.ts's ambient augmentation,
// which isn't visible to every importing package; read it through a structural
// cast so the default param below type-checks anywhere this module is imported.
const realHot = (import.meta as { hot?: HotContext }).hot;

type HmrErrorPhase = "compile" | "evaluate" | "render";

function explicitErrorPhase(error: unknown): HmrErrorPhase | undefined {
  if (error !== null && typeof error === "object") {
    const candidate = error as { phase?: unknown };
    if (
      candidate.phase === "compile" ||
      candidate.phase === "evaluate" ||
      candidate.phase === "render"
    ) {
      return candidate.phase;
    }
  }
  return undefined;
}

// Process-wide privileged bridge state. Kept on globalThis so every Runtime copy
// in the process (externalized Node resolution, Vitest-transformed source, and a
// monorepo-bundled SSR graph) shares one session: connectDevtools in the app, and
// disconnectDevtools from @vue-tui/vite's close hook, must see the same owners.
// Module-local `let` would silently fork under those graphs and leak the app.
const GLOBAL_KEY = "__vue_tui_devtools_bridge__";

interface DevtoolsBridgeState {
  bridgedHot: HotContext | undefined;
  activeSessionId: string | undefined;
  currentDevSession: DevSession | undefined;
  pendingResetTimer: ReturnType<typeof setTimeout> | undefined;
  devConnected: boolean;
  /** Bumped by any error source, so a batch can tell that one fired while it was open. */
  errorGeneration: number;
}

function bridge(): DevtoolsBridgeState {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: DevtoolsBridgeState;
  };
  const state = (g[GLOBAL_KEY] ??= {
    bridgedHot: undefined,
    activeSessionId: undefined,
    currentDevSession: undefined,
    pendingResetTimer: undefined,
    devConnected: false,
    errorGeneration: 0,
  });
  // A second Runtime module graph can reuse bridge state created by an older
  // copy in the same dev process. Upgrade that state in place.
  state.errorGeneration ??= 0;
  return state;
}

// Register listeners once PER hot context, not once per process. connectDevtools()
// is the sole caller (the injected dev module calls it with import.meta.hot); on a
// full reload Vite re-executes that module and hands us a NEW hot whose constructor
// already stripped the previous hot's listeners, so we must re-arm the new one.
// Tracking hot identity re-arms each new hot while still ignoring a redundant
// re-call on the SAME hot (Vite appends listeners with no dedup, so re-registering
// the same hot would double-fire every event). Process-global storage keeps this
// correct when Runtime is externalized (published install and forced monorepo path).

/** Get the process-wide development owner that will build the next mounted Session. */
export function acquireDevSession(): DevSession {
  const state = bridge();
  return (state.currentDevSession ??= new DevSession());
}

/** Clear the active DevSession after normal application disposal; retain it while a full reload replaces its Runtime Session. */
export function unregisterDevSession(session: DevSession): void {
  const state = bridge();
  if (state.currentDevSession === session) state.currentDevSession = undefined;
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
  // Vite retires a hot context without giving consumers an unsubscribe API.
  // A queued event from that context must not mutate a later process-wide
  // session after disconnect or full reload.
  const onCurrentHot = (event: string, handler: (payload: unknown) => void): void => {
    hot.on(event, (payload) => {
      if (bridge().bridgedHot !== hot) return;
      handler(payload);
    });
  };

  let failedUpdateTimestamp: number | undefined;
  let latestSettledTimestamp: number | undefined;
  let pendingUpdate:
    | {
        paths: string[];
        failed: boolean;
        stale: boolean;
        timestamp: number | undefined;
        errorGeneration: number;
      }
    | undefined;

  onCurrentHot("vue-tui:hmr-error-context", (payload) => {
    const p = payload as { timestamp: number };
    failedUpdateTimestamp = p.timestamp;
  });

  onCurrentHot("vite:error", (payload) => {
    const p = payload as { err: DevErrorInfo };
    const phase = explicitErrorPhase(p.err);
    const current = devState.value;
    if (
      failedUpdateTimestamp !== undefined &&
      failedUpdateTimestamp === latestSettledTimestamp &&
      current.type === "error" &&
      current.error.message === p.err.message &&
      current.error.phase === phase
    ) {
      // Client compilation and the SSR preflight can report the same failure
      // through separate Vite channels. Keep one presentation/event for this
      // watcher task while allowing the same diagnostic on a later edit.
      return;
    }
    // Kept as a second line of defence, not as the fix. Deduplicating here needs
    // to infer "same watcher task" from timestamps, and both conditions above
    // can be false when the second payload arrives. The Vite plugin removes an
    // repeated source-state watcher task before it reaches HMR, while the bridge
    // pairs the client/SSR copies produced by one remaining task.
    //
    // This is deliberately not narrowed to message+phase: the timestamp
    // conditions are what keep the stale-error protection below from collapsing a
    // genuine later failure, and `stale-error-cannot-overwrite.test.ts` guards
    // that part.
    emitTestEvent(RUNTIME_TEST_EVENT.hmrError, phase === undefined ? undefined : { phase });
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
    devState.value = { type: "error", error: p.err };
  });

  onCurrentHot("vite:beforeUpdate", (payload) => {
    // Beginning an update is not proof that it succeeded. Keep any current
    // error visible until Vite emits afterUpdate for this batch.
    const p = payload as {
      updates: Array<{ path: string; acceptedPath?: string; timestamp?: number }>;
    };
    // This event is a synchronization boundary, not a semantic classification.
    // An inlined template edit and a script edit both arrive as `/src/app.vue`;
    // only the compiler's accept callback later knows rerender versus reload.
    emitTestEvent(RUNTIME_TEST_EVENT.hmrUpdateReceived);
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
      errorGeneration: state.errorGeneration,
    };
  });

  onCurrentHot("vite:afterUpdate", () => {
    const update = pendingUpdate;
    pendingUpdate = undefined;
    if (!update || update.failed || update.stale) return;
    if (update.timestamp !== undefined) {
      latestSettledTimestamp = update.timestamp;
    }
    // Any error since this batch opened invalidates it; which source it came
    // from was never distinguished.
    if (update.errorGeneration !== state.errorGeneration) return;
    // A successful later update supersedes any previously failed batch. Older
    // successes returned above, so they cannot clear a newer failure.
    failedUpdateTimestamp = undefined;
    devState.value = {
      type: "update",
      paths: update.paths,
    };
    emitTestEvent(RUNTIME_TEST_EVENT.hmrUpdateApplied);
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

  onCurrentHot("vite:beforeFullReload", () => {
    emitTestEvent(RUNTIME_TEST_EVENT.hmrUpdateReceived, { kind: "full-reload" });
    // The module runner re-imports the entry after a full reload. Release the
    // current app first so its replacement can acquire the same terminal.
    clearPendingResetTimer();
    pendingUpdate = undefined;
    failedUpdateTimestamp = undefined;
    // Keep the DevSession registered while Vite clears modules and imports the
    // replacement entry. Its old Runtime Session is disposed here; the new
    // entry calls acquireDevSession().build(...) after it evaluates.
    bridge().currentDevSession?.replace();
  });
}

// Whether the dev integration has been connected. The development app factory reads this to
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

const DEV_SESSION_CONFLICT: unique symbol = Symbol.for("@vue-tui/runtime:dev-session-conflict");

export class VueTuiDevSessionConflictError extends Error {
  override readonly name = "VueTuiDevSessionConflictError";

  constructor() {
    super(
      "[vue-tui] another Vite dev session is already active in this process; close it before starting a new one",
    );
    Object.defineProperty(this, DEV_SESSION_CONFLICT, { value: true });
  }
}

export function isVueTuiDevSessionConflictError(error: unknown): error is Error {
  if (error === null || (typeof error !== "object" && typeof error !== "function")) return false;
  try {
    return (error as { [DEV_SESSION_CONFLICT]?: unknown })[DEV_SESSION_CONFLICT] === true;
  } catch {
    // This predicate runs while handling arbitrary legal thrown values. A Proxy
    // may trap symbol access; classification must never replace the original
    // failure or reject the fire-and-forget dev-server launch task.
    return false;
  }
}

// Privileged dev entry point for @vue-tui/vite (exposed via @vue-tui/runtime/internal/devtools).
// Hands a live Vite hot context to the HMR bridge and flips the dev flag.
export function connectDevtools(hot: HotContext, options?: ConnectDevtoolsOptions): void {
  const sessionId = options?.sessionId;
  const state = bridge();
  if (state.activeSessionId !== undefined && sessionId !== state.activeSessionId) {
    throw new VueTuiDevSessionConflictError();
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
 * Ends the mounted development Session and settles its exit, clears pending dev-status
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
    state.currentDevSession === undefined &&
    state.bridgedHot === undefined &&
    state.pendingResetTimer === undefined &&
    state.activeSessionId === undefined
  ) {
    return;
  }

  clearPendingResetTimer();

  const devSession = state.currentDevSession;
  state.currentDevSession = undefined;
  // Disconnect the hot channel BEFORE normal app exit settles. Its exit-finally
  // notification then becomes a no-op instead of re-entering server.close().
  state.bridgedHot = undefined;
  state.devConnected = false;
  state.activeSessionId = undefined;
  devState.value = { type: "ok" };
  return devSession?.close();
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
// (the app factory can run multiple times: two apps, unmount + re-create, a tool
// that restarts the UI, a test run). Nothing else clears it on the create path,
// so without this a freshly-mounted app injects the stale state and renders the
// old "Build Error" / "[HMR] updated" overlay instead of its own content.
// The development app factory calls this once per connected app setup. We don't touch `pendingResetTimer` here: its firing is guarded on
// `type === "update"`, which this reset clears, and the vite:beforeUpdate handler
// clears any prior timer before arming a new one — so a stale timer can't clobber
// a later app. (disconnectDevtools clears the timer explicitly when the session ends.)
export function resetDevState(): void {
  devState.value = { type: "ok" };
}

/**
 * Mark the HMR batch currently executing in Vite's module runner as failed.
 *
 * The runner reports its error over the same queued hot channel as the update,
 * so that payload arrives after `vite:afterUpdate`. This synchronous marker
 * prevents the failed batch from briefly clearing the overlay first.
 */
export function invalidateDevHmrUpdate(): void {
  const state = bridge();
  if (!state.devConnected) return;
  state.errorGeneration += 1;
  clearPendingResetTimer();
}

function normalizeRenderError(error: unknown): DevErrorInfo {
  let message: string | undefined;
  let stack: string | undefined;
  try {
    if (
      error !== null &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      message = error.message;
    }
    if (
      error !== null &&
      typeof error === "object" &&
      "stack" in error &&
      typeof error.stack === "string"
    ) {
      stack = error.stack;
    }
  } catch {
    // A hostile thrown object's getters must not break the dev error boundary.
  }
  if (message === undefined) {
    try {
      message = String(error);
    } catch {
      message = "Unknown render error";
    }
  }
  return { message, stack, phase: "render" };
}

/** Report a render-function failure caught by the dev-only overlay boundary. */
export function reportDevRenderError(error: unknown): void {
  const state = bridge();
  if (!state.devConnected) return;
  const normalized = normalizeRenderError(error);
  // Every captured render failure invalidates the update batch that was active
  // when it rendered, even when its message and stack match the error already
  // on screen. Presentation/event deduplication below must not turn a repeated
  // failure into a successful update.
  state.errorGeneration += 1;
  const current = devState.value;
  if (
    current.type === "error" &&
    current.error.phase === "render" &&
    current.error.message === normalized.message &&
    current.error.stack === normalized.stack
  ) {
    return;
  }

  clearPendingResetTimer();
  devState.value = { type: "error", error: normalized };
  emitTestEvent(RUNTIME_TEST_EVENT.hmrError, { phase: "render" });
}
