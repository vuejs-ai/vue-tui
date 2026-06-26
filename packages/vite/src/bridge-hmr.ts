import type { HotPayload, ViteDevServer } from "vite";

// plugin-vue broadcasts its rerender-vs-reload custom event ("file-changed") through
// server.ws, but this dev server runs the app in the SSR runnable environment with the
// browser socket off — so the module runner never sees it and every edit falls through
// to a state-RESETTING reload. Forward ws custom payloads onto the ssr environment's hot
// channel so template-only edits do a state-PRESERVING rerender (web parity).
export function bridgeHmrEventsToRunner(server: ViteDevServer): void {
  const ssr = server.environments.ssr;
  if (!ssr) return;
  const ws = server.ws as { send: (...a: [HotPayload] | [string, unknown?]) => void };
  const original = ws.send.bind(ws);
  ws.send = (...args: [HotPayload] | [string, unknown?]): void => {
    const payload: HotPayload =
      typeof args[0] === "string" ? { type: "custom", event: args[0], data: args[1] } : args[0];
    if (payload.type === "custom") ssr.hot.send(payload);
    original(...args);
  };
}
