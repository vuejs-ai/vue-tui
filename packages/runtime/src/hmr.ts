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

export function initHmrBridge(): void {
  if (!import.meta.hot) return;

  import.meta.hot.on("vite:error", (payload: unknown) => {
    const p = payload as { err: DevErrorInfo };
    devState.value = { type: "error", error: p.err };
  });

  import.meta.hot.on("vite:beforeUpdate", (payload: unknown) => {
    const p = payload as { updates: Array<{ path: string }> };
    devState.value = {
      type: "update",
      paths: p.updates.map((u) => u.path),
    };
    setTimeout(() => {
      if (devState.value.type === "update") {
        devState.value = { type: "ok" };
      }
    }, 2000);
  });

  import.meta.hot.on("vite:beforeFullReload", () => {
    import.meta.hot!.send("vue-tui:request-reload");
  });
}
