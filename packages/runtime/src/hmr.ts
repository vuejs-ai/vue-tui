import { type InjectionKey, shallowRef, type ShallowRef } from "@vue/runtime-core";

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

// Registration must happen AT MOST ONCE per module lifetime. createApp() can run
// multiple times in one dev process (two apps, unmount + re-create, a tool that
// restarts the UI, a test run) and each call reaches here. Vite's Node HMR
// runtime APPENDS listeners with no dedup, so without this guard N createApp()
// calls would leak N copies of every handler — firing each HMR event N times.
let initialized = false;

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
  if (initialized) return;
  initialized = true;

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
    hot.send("vue-tui:request-reload");
  });
}
