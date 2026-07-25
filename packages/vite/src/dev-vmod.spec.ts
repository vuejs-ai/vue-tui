import { test, expect } from "vite-plus/test";
import { devVmodPlugin, DEV_VMOD_ID, RESOLVED_DEV_VMOD_ID } from "./dev-vmod.ts";

test("virtual dev module connects with the session id", () => {
  const plugin = devVmodPlugin({ sessionId: "session-abc" }) as unknown as {
    resolveId: (id: string) => string | undefined;
    load: (id: string) => string | undefined;
  };
  expect(plugin.resolveId(DEV_VMOD_ID)).toBe(RESOLVED_DEV_VMOD_ID);
  const code = plugin.load(RESOLVED_DEV_VMOD_ID);
  expect(code).toContain('from "@vue-tui/runtime/internal/devtools"');
  expect(code).toContain('connectDevtools(import.meta.hot, { sessionId: "session-abc" })');
});
