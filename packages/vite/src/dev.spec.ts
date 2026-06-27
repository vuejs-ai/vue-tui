import { test, expect } from "vite-plus/test";
import { devPlugin } from "./dev.ts";
import { vueTui } from "./index.ts";
import { DEV_VMOD_ID } from "./dev-vmod.ts";

// Vite's transform hook receives an ABSOLUTE fs path, while the configured `entry`
// is root-relative ("/src/..."). These tests pin that the injector matches on the
// absolute path, including for a CUSTOM entry (the bug: a Set of root-relative ids
// never matched the absolute path, so a custom entry got no virtual:vue-tui/dev).
type TransformFn = (this: unknown, code: string, id: string) => { code: string } | undefined;
const injectPrefix = `import ${JSON.stringify(DEV_VMOD_ID)};\n`;

function transformOf(opts: { entry?: string }): TransformFn {
  return (devPlugin(opts) as unknown as { transform: TransformFn }).transform;
}

test("injects the dev module into a CUSTOM entry matched by absolute path", () => {
  const transform = transformOf({ entry: "/src/app.ts" });
  const out = transform("export const x = 1;", "/Users/proj/src/app.ts");
  expect(out?.code).toBe(`${injectPrefix}export const x = 1;`);
});

test("injects the dev module into the DEFAULT entry", () => {
  const transform = transformOf({});
  const out = transform("export const x = 1;", "/Users/proj/src/main.ts");
  expect(out?.code).toBe(`${injectPrefix}export const x = 1;`);
});

test("does not inject into non-entry modules", () => {
  const transform = transformOf({ entry: "/src/app.ts" });
  expect(transform("export const x = 1;", "/Users/proj/src/other.ts")).toBeUndefined();
});

test("strips the query suffix before matching the entry", () => {
  const transform = transformOf({});
  const out = transform("export const x = 1;", "/Users/proj/src/main.ts?vue&type=script");
  expect(out?.code).toBe(`${injectPrefix}export const x = 1;`);
});

// A "./"-prefixed custom entry must still inject (dev matches the absolute id via endsWith,
// which a literal "./src/..." can never match). vueTui() normalizes the entry so dev and
// build agree; without it the dev module was silently skipped (no HMR/overlay) while build
// still succeeded.
test("vueTui normalizes a './'-prefixed custom entry so the dev module still injects", () => {
  const dev = vueTui({ entry: "./src/app.ts" }).find(
    (p) => p.name === "vue-tui:dev",
  ) as unknown as {
    transform: TransformFn;
  };
  const out = dev.transform("export const x = 1;", "/Users/proj/src/app.ts");
  expect(out?.code).toBe(`${injectPrefix}export const x = 1;`);
});
