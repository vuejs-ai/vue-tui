// SEQUENTIAL: writes/removes the fixture's dist/ directory on the real fs, so concurrent
// builds racing on dist/ are pinned to a *.sequential.test.ts file.
//
// Uses a DEDICATED `build` fixture (a copy of `basic`): dev.sequential MUTATES
// fixtures/basic/src/app.vue (its hot-swap test swaps LABEL-A out), and file-parallelism
// (fileParallelism: true) would otherwise let that edit land in this build's output mid-run
// and break the toContain("LABEL-A") assertion. A private fixture removes the shared file.
//
// NOTE: We pass configFile: false and provide vueTui() plugins inline rather than loading the
// fixture's vite.config.ts. rolldown v0.2.1 (used by vite-plus-core) has a bug where bundling a
// config file that combines transform.define with a plugin transform returning { code, map: null }
// throws "TypeError: Cannot convert undefined or null to object" in the bundleConfigFile WASM
// binding. Bypassing config-file loading sidesteps the bug while still exercising the real build:
// buildConfigPlugin (apply: "build") sets rollupOptions.input + the externalize predicate.
import { test, expect, afterEach } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { existsSync, rmSync } from "node:fs";
import { build, type Rollup } from "vite";
import { vueTui } from "../src/index.ts";

const root = fileURLToPath(new URL("./fixtures/build", import.meta.url));
const dist = `${root}/dist`;

afterEach(() => {
  rmSync(dist, { recursive: true, force: true });
});

test("vite build emits a single self-contained Node entry with deps externalized", async () => {
  rmSync(dist, { recursive: true, force: true });
  const output = await build({ root, configFile: false, plugins: vueTui(), logLevel: "silent" });

  // A single, named input resolves to one RollupOutput (not a watcher).
  const result = (Array.isArray(output) ? output[0] : output) as Rollup.RollupOutput;
  const entryChunk = result.output.find(
    (c): c is Rollup.OutputChunk => c.type === "chunk" && c.isEntry,
  );

  expect(entryChunk?.fileName).toBe("main.js");
  expect(existsSync(`${dist}/main.js`)).toBe(true);

  const code = entryChunk!.code;
  // Bare deps stay external bare imports for Node to resolve at runtime (not inlined).
  expect(code).toMatch(/from\s*["']@vue-tui\/runtime["']/);
  expect([...entryChunk!.imports]).toContain("@vue-tui/runtime");
  // The relative app.vue id was bundled in, so its rendered content is present in the entry.
  expect(code).toContain("LABEL-A");
});
