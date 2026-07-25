import { test, expect } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const vitePkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
const runtimePkg = require("@vue-tui/runtime/package.json") as { version: string };

test("peerDependency on @vue-tui/runtime is an exact package version match", () => {
  const vitePkg = JSON.parse(readFileSync(vitePkgPath, "utf8")) as {
    peerDependencies: Record<string, string>;
  };
  const peer = vitePkg.peerDependencies["@vue-tui/runtime"];
  // Ordinary semver ranges (^ / ~ / workspace:^) would allow an incompatible
  // Runtime internal protocol. Prefer exact package-version matching.
  expect(peer).toBe(runtimePkg.version);
  expect(peer).toMatch(/^\d+\.\d+\.\d+$/);
  expect(peer).not.toMatch(/^[\^~]/);
  expect(peer).not.toContain("workspace:");
});
