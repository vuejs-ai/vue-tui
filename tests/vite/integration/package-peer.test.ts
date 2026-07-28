import { test, expect } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const vitePkgPath = require.resolve("@vue-tui/vite/package.json");
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

test("compiler peers expose the supported SFC and JSX integrations as optional", () => {
  const vitePkg = JSON.parse(readFileSync(vitePkgPath, "utf8")) as {
    peerDependencies: Record<string, string>;
    peerDependenciesMeta: Record<string, { optional?: boolean }>;
  };

  expect(vitePkg.peerDependencies).not.toHaveProperty("@vitejs/plugin-vue");
  expect(vitePkg.peerDependencies).toHaveProperty("unplugin-vue");
  expect(vitePkg.peerDependencies).toHaveProperty("@vitejs/plugin-vue-jsx");
  expect(vitePkg.peerDependenciesMeta).toMatchObject({
    "unplugin-vue": { optional: true },
    "@vitejs/plugin-vue-jsx": { optional: true },
  });
});

// These are compatibility pins, not minimums. The package adapts compiler hooks
// and guards Vite through private HMR seams; a caret would claim untested future
// implementations that consumer installs never run this suite against.
test.for(["unplugin-vue", "@vitejs/plugin-vue-jsx", "vite"] as const)(
  "the %s compatibility peer is exactly the version this suite verifies",
  (name) => {
    const vitePkg = JSON.parse(readFileSync(vitePkgPath, "utf8")) as {
      peerDependencies: Record<string, string>;
    };
    const installed = (require(`${name}/package.json`) as { version: string }).version;

    expect(vitePkg.peerDependencies[name]).toBe(installed);
  },
);
