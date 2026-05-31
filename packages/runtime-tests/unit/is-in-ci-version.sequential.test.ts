// SEQUENTIAL: mutates process.env (vi.stubEnv) + vi.resetModules to re-evaluate the
// import-time `is-in-ci` module — both are process-global, so this must not run
// concurrently with other tests that read env or the module cache.
import { afterEach, expect, test, vi } from "vite-plus/test";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// vue-tui pins is-in-ci to ^2.0.0 to match Ink (Ink package.json), aligning the
// CI-detection formula that feeds the `interactive` default (render.ts:503) and
// shouldSynchronize (write-synchronized.ts:9). v1 and v2 diverge on edge env configs;
// this locks that we resolve v2's formula.
//
// v2: `check(k) = k in env && env[k] !== '0' && env[k] !== 'false'`, then
//     `isInCi = check('CI') || check('CONTINUOUS_INTEGRATION')` — the two checks are
//     INDEPENDENT (and there is no `CI_*`-prefix scan, which v1 had).
// v1: gated the WHOLE expression on `env.CI !== '0' && env.CI !== 'false'`, so a
//     falsy CI short-circuited the CONTINUOUS_INTEGRATION branch too.
test("is-in-ci resolves Ink's v2 formula: CI=false + CONTINUOUS_INTEGRATION=true → true", async () => {
  vi.resetModules();
  vi.stubEnv("CI", "false");
  vi.stubEnv("CONTINUOUS_INTEGRATION", "true");
  const { default: isInCi } = await import("is-in-ci");
  // v2: check('CI') is false (CI==='false'), check('CONTINUOUS_INTEGRATION') is true → true.
  // v1 would be FALSE here — its `env.CI !== 'false'` guard short-circuits the whole thing.
  expect(isInCi).toBe(true);
});
