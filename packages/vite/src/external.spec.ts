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
