// SEQUENTIAL: spawns child Node processes whose behavior is governed by the
// PROCESS-GLOBAL `CI` env var. `is-in-ci` reads it ONCE at module-import time, so
// the bug under test (consumers running @vue-tui/testing in CI) can only be
// reproduced in a fresh process with CI baked into its env — an in-process test
// under this repo's forced CI=false cannot see it. Children also each get a fresh
// chalk, so FORCE_COLOR is set per-spawn (project rule). Grouped here, off the
// parallel pool, because it shells out and asserts cross-process behavior.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "subprocess-fixtures", "testing-render-interactive.mjs");

type FixtureResult = { before: number; after: number; rawMode: boolean };

// Run the fixture (which imports the BUILT @vue-tui/testing dist) in a child
// process with an explicit CI value. cwd is this package so the workspace dist
// of @vue-tui/testing + @vue-tui/runtime resolves.
function runFixture(ci: "true" | "false"): Promise<FixtureResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fixture], {
      cwd: path.resolve(here, ".."),
      env: {
        ...process.env,
        // Bake the CI value into the child so its import-time is-in-ci sees it.
        CI: ci,
        // Each child is a fresh Node with its own chalk; force ANSI so the
        // bordered frame actually renders box-drawing chars (project rule).
        FORCE_COLOR: "3",
        NODE_NO_WARNINGS: "1",
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`fixture exited ${code} (CI=${ci})\n${stderr}\n${stdout}`));
        return;
      }
      const last = stdout.trim().split("\n").at(-1) ?? "";
      try {
        resolve(JSON.parse(last) as FixtureResult);
      } catch {
        reject(new Error(`could not parse fixture output (CI=${ci}): ${stdout}`));
      }
    });
  });
}

// render() must pin interactive ON so its advertised resize()/rawMode APIs work
// for consumers regardless of ambient CI/TTY detection. Before the fix, a CI=true
// consumer silently lost both: resize() was ignored (no re-layout) and the
// lifetime raw-mode hold never engaged.
test("@vue-tui/testing render() honors resize() under CI=true (interactive pinned)", async () => {
  const result = await runFixture("true");
  // The bordered box fills the terminal: 40 cols → 12 cols after resize.
  expect(result.before).toBe(40);
  expect(result.after).toBe(12); // pre-fix this was 40 — resize ignored.
  // The lifetime raw-mode hold must engage too (advertised in the README).
  expect(result.rawMode).toBe(true); // pre-fix this was false.
});

test("@vue-tui/testing render() behaves identically under CI=false", async () => {
  // Sanity that pinning interactive is a no-op for the already-interactive path:
  // CI=false produced correct behavior before and after the fix.
  const result = await runFixture("false");
  expect(result.before).toBe(40);
  expect(result.after).toBe(12);
  expect(result.rawMode).toBe(true);
});
