import { expect, test } from "vite-plus/test";
import { external } from "./vite.ts";

// `external(id) === true`  -> kept external (Node resolves it at runtime)
// `external(id) === false` -> bundled into the output

test("bundles relative imports", () => {
  expect(external("./App.vue")).toBe(false);
  expect(external("../shared/util.ts")).toBe(false);
});

test("bundles \\0-prefixed virtual modules", () => {
  expect(external("\0plugin-vue:export-helper")).toBe(false);
});

test("bundles POSIX absolute paths (the resolved SFC + its ?vue sub-modules)", () => {
  expect(external("/home/me/app/src/App.vue")).toBe(false);
  expect(external("/home/me/app/src/App.vue?vue&type=script&setup=true&lang.ts")).toBe(false);
});

// Regression for vue-tui#209: on Windows @vitejs/plugin-vue resolves the SFC to
// a drive-letter (or UNC) absolute path. The old `!id.startsWith("/")` heuristic
// failed to recognize these as internal, so the .vue file was wrongly marked
// external and `node dist/app.mjs` crashed with ERR_MODULE_NOT_FOUND.
test("bundles Windows absolute paths (vue-tui#209)", () => {
  expect(external("D:\\Users\\boer\\Desktop\\my-app\\src\\App.vue")).toBe(false);
  expect(
    external("D:/Users/boer/Desktop/my-app/src/App.vue?vue&type=script&setup=true&lang.ts"),
  ).toBe(false);
  expect(external("C:\\x\\y.vue")).toBe(false);
  // UNC path
  expect(external("\\\\server\\share\\App.vue")).toBe(false);
});

test("externalizes bare specifiers so Node resolves them at runtime", () => {
  expect(external("vue")).toBe(true);
  expect(external("@vue-tui/runtime")).toBe(true);
  expect(external("chalk")).toBe(true);
});

test("externalizes Node built-ins", () => {
  expect(external("node:fs")).toBe(true);
  expect(external("fs")).toBe(true);
});
