// Regression test for #238: @vue-tui/vite must be loadable from a CommonJS consumer project.
//
// When a consumer's nearest package.json is `type: commonjs` (or has no `type` field — Node
// defaults to CommonJS), Vite bundles+loads vite.config.ts as CommonJS and resolves its imports
// under the `require` condition. @vue-tui/vite once exported only an `import` condition with no
// fallback, so nothing matched under `require` and config loading threw:
//
//   [plugin externalize-deps] Failed to resolve "@vue-tui/vite".
//   This package is ESM only but it was tried to load by `require`.
//
// The fixture (test/fixtures/cjs-config) has its own `type: commonjs` package.json to force the
// CJS config path, and imports @vue-tui/vite BY NAME. We symlink the real package into the
// fixture's node_modules first, so the bare import resolves against the built package and this
// exercises its published exports map under `require` — exactly a real consumer's layout.
// resolveConfig() runs the real config loader (the code path that threw) without a server/build.
import { test, expect, beforeAll, afterAll } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { resolveConfig } from "vite";

const root = fileURLToPath(new URL("./fixtures/cjs-config", import.meta.url));
const pkgRoot = fileURLToPath(new URL("../", import.meta.url)); // packages/vite
const fixtureModules = `${root}/node_modules`;

beforeAll(() => {
  rmSync(fixtureModules, { recursive: true, force: true });
  mkdirSync(`${fixtureModules}/@vue-tui`, { recursive: true });
  // "junction" keeps this cross-platform (absolute dir link on Windows, plain symlink on POSIX).
  symlinkSync(pkgRoot, `${fixtureModules}/@vue-tui/vite`, "junction");
});

afterAll(() => {
  rmSync(fixtureModules, { recursive: true, force: true });
});

test("loads a config that imports @vue-tui/vite from a CommonJS project (#238)", async () => {
  const config = await resolveConfig(
    { root, configFile: `${root}/vite.config.ts`, logLevel: "silent" },
    "serve",
  );

  // The config resolved AND executed vueTui() under the CJS `require` path: its plugins are here.
  expect(config.plugins.some((p) => p.name?.startsWith("vue-tui"))).toBe(true);
});
