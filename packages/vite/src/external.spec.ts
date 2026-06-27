import { test, expect } from "vite-plus/test";
import { isExternalId } from "./external.ts";

test("bare imports are external; relative/virtual/\\0 stay bundled", () => {
  expect(isExternalId("@vue-tui/runtime")).toBe(true);
  expect(isExternalId("node:fs")).toBe(true);
  expect(isExternalId("./app.vue")).toBe(false);
  expect(isExternalId("/abs/x")).toBe(false);
  expect(isExternalId("\0virtual:vue-tui/dev")).toBe(false);
  expect(isExternalId("virtual:vue-tui/dev")).toBe(false);
});

// Regression for vue-tui#209: @vitejs/plugin-vue resolves the SFC to an ABSOLUTE
// path before this predicate runs. On Windows that's a drive-letter / UNC path that a
// POSIX-only `/`-prefix check misses, so the .vue file got externalized and the built
// `node dist/main.js` crashed with ERR_MODULE_NOT_FOUND. Absolute paths (both schemes)
// must stay bundled. Covered from Linux/macOS CI via literal win32 path strings.
test("windows-absolute SFC paths stay bundled (vue-tui#209)", () => {
  expect(isExternalId("D:\\app\\src\\App.vue")).toBe(false); // drive-letter backslash
  expect(isExternalId("D:/app/src/App.vue")).toBe(false); // drive-letter forward slash
  expect(isExternalId("\\\\server\\share\\App.vue")).toBe(false); // UNC path
});
