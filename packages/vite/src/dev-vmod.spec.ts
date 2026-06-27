import { test, expect } from "vite-plus/test";
import { devVmodPlugin, DEV_VMOD_ID, RESOLVED_DEV_VMOD_ID } from "./dev-vmod.ts";

test("resolves the virtual id to its \\0 form and loads the connect snippet", () => {
  const p = devVmodPlugin() as unknown as {
    resolveId: (id: string) => string | undefined;
    load: (id: string) => string | undefined;
  };
  expect(p.resolveId(DEV_VMOD_ID)).toBe(RESOLVED_DEV_VMOD_ID);
  expect(p.resolveId("other")).toBeUndefined();
  const code = p.load(RESOLVED_DEV_VMOD_ID)!;
  expect(code).toContain('from "@vue-tui/runtime/internal"');
  expect(code).toContain("connectDevtools(import.meta.hot)");
  expect(p.load("other")).toBeUndefined();
});
