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

// vueTui() normalizes the dev `entry` so the dev plugin (which matches the absolute module id via
// endsWith) injects the HMR snippet on it. Rooted forms — a leading "/" (root-relative /
// POSIX-absolute / UNC) or a Windows drive-letter — pass through unchanged; relative forms
// ("./src/x") get a leading slash. The "./" case previously missed the module id (no HMR/overlay),
// so this pins the normalization across all forms. (The production build is tsdown's job now, not
// vueTui's, so there's no build-input side to assert here anymore.)
const ENTRY_CASES = [
  { name: "'./'-relative", entry: "./src/app.ts", id: "/Users/proj/src/app.ts" },
  { name: "Windows drive-letter", entry: "C:/proj/src/main.ts", id: "C:/proj/src/main.ts" },
  {
    name: "Windows UNC",
    entry: "\\\\server\\share\\src\\main.ts",
    id: "//server/share/src/main.ts",
  },
  {
    name: "POSIX-absolute",
    entry: "/Users/proj/app/src/main.ts",
    id: "/Users/proj/app/src/main.ts",
  },
];

test.each(ENTRY_CASES)(
  "vueTui normalizes a $name entry so dev injects on the module id",
  ({ entry, id }) => {
    const plugins = vueTui({ entry });
    const dev = plugins.find((p) => p.name === "vue-tui:dev") as unknown as {
      transform: TransformFn;
    };
    expect(dev.transform("export const x = 1;", id)?.code).toBe(
      `${injectPrefix}export const x = 1;`,
    );
  },
);
