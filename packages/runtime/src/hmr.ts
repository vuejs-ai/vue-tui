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

// The single pending "update → ok" reset timer. Tracked at module scope (safe
// because `initialized` makes initHmrBridge run at most once per module lifetime)
// so each new update can clear the prior update's timer before scheduling its own.
let resetTimer: ReturnType<typeof setTimeout> | undefined;

// `hot` is injectable (defaulting to the real import.meta.hot) purely for tests:
// import.meta.hot is undefined under vitest, so the body is otherwise unreachable.
export function initHmrBridge(hot: HotContext | undefined = realHot): void {
  if (!hot) return;
  if (initialized) return;
  initialized = true;

  hot.on("vite:error", (payload: unknown) => {
    const p = payload as { err: DevErrorInfo };
    devState.value = { type: "error", error: p.err };
  });

  hot.on("vite:beforeUpdate", (payload: unknown) => {
    const p = payload as { updates: Array<{ path: string }> };
    devState.value = {
      type: "update",
      paths: p.updates.map((u) => u.path),
    };
    // Only the most recent update's reset window is honored: clear any prior
    // pending reset so an earlier update's timer can't reset devState while a
    // newer update's status line is still showing (rapid saves within 2s).
    if (resetTimer !== undefined) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetTimer = undefined;
      // Guard preserved: if a vite:error arrived after the update, devState is
      // no longer "update" and we must NOT clobber the error back to ok.
      if (devState.value.type === "update") {
        devState.value = { type: "ok" };
      }
    }, 2000);
  });

  hot.on("vite:beforeFullReload", () => {
    hot.send("vue-tui:request-reload");
  });
}
