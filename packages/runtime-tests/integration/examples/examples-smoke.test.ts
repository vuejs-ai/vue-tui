import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect, afterEach } from "vite-plus/test";
import { exampleDir, launch, viteBin, type Launched } from "./helpers/run-example.ts";

// End-to-end smoke test for the shipped examples (#212). The 0.1.0 crash —
// `Calling \`require\` for "node:module" in an environment that doesn't expose \`require\`` — came
// from the old @vue-tui/cli's bundledDev step, which folded CJS into a single ESM bundle. The
// @vue-tui/vite plugin (#215) deleted that path: dev runs in-process through Vite's SSR module
// runner and the production build externalizes every bare dep. This guards that the shipped
// examples still launch and paint, so a regression that reintroduces a module-system crash fails
// CI on every change.
//
// Why a real PTY: a TUI gates its full paint on an interactive TTY (`interactive = !isInCi && isTTY`),
// so a piped/non-TTY child renders nothing — a non-PTY smoke test would be a false negative. Each
// runnable example is launched under a pseudo-terminal and we wait for its title to paint.
//
// What each path actually guards (be precise, don't oversell):
//   - dev (`vite`): the in-process dev server boots and paints. In THIS monorepo the dev path
//     BUNDLES @vue-tui/runtime (the workspace symlink's real path is outside node_modules, so Vite's
//     SSR runner re-executes it), so it can't reproduce #212's externalized-load crash — it guards
//     the dev plugin itself (client-compile, CLI-shortcut neutralization, HMR bridge, blank paint).
//   - build (`node dist/main.js`): the bundle externalizes @vue-tui/runtime and Node loads it via
//     native ESM. This is the externalized launch guard; if a regression let a CJS `require` survive
//     into the ESM bundle (the #212 fault class), the shim throws at startup and this goes red
//     (verified by injecting a bare `require()` into an entry — it reproduces #212 exactly).
//
// Coverage boundary: the externalized *dev* path a published `npm install` takes (runtime resolved
// through the SSR runner's externalize/conditions, not bundled) cannot be reproduced from an
// in-repo example because the workspace symlink forces bundling. It is NOT covered here; guarding it
// would need a packed-install fixture and belongs with @vue-tui/vite's own suite.

// Both the template and JSX apps title themselves "vue-tui basic (…)". Letters-only this is
// "vuetuibasic", which the wrap-robust matcher in run-example.ts finds regardless of where the
// box's `width="20"` wraps the title. NB: basic-template must keep `flexDirection="column"` — the
// default row layout interleaves its sibling Texts column-by-column and breaks this contiguous
// token (the test then fails via timeout), so that prop is load-bearing here, not cosmetic.
const TITLE_TOKEN = "vue-tui basic";

// The two "hello world" apps are deterministic and key-free, so they get the full dev + build paint
// check. coding-agent uses the same @vue-tui/vite build but needs a live LLM key to RUN, so it gets
// a build-only guard below. flappy-bird is absent from THIS pair because it doesn't use @vue-tui/vite
// — it's the SELF-CONTAINED example (raw vite, everything bundled into one dist/game.mjs), guarded by
// its own dedicated test at the bottom of this file instead of this plugin-shaped dev/build pair.
const RUNNABLE = [
  { name: "basic-template", dir: exampleDir("basic-template") },
  { name: "basic-jsx", dir: exampleDir("basic-jsx") },
] as const;

// The fingerprint #212 leaves in a built bundle: rolldown couldn't externalize a CJS `require`, so
// it emitted the runtime shim that throws on call. Asserting the bundle is free of this is a fast,
// deterministic #212 guard that needs no PTY and no API key — usable even for examples we can't run.
const CJS_REQUIRE_SHIM = /doesn't expose the `require` function|Calling `require` for/;

// Build an example and assert the bundle carries no #212 shim — the single home for that invariant,
// shared by the runnable apps (before they're launched) and the build-only coding-agent guard.
// `vite build` needs no TTY; a plain child process is enough. Bounded so a wedged build can't hang
// the worker (execFileSync blocks synchronously, so vitest's testTimeout can't preempt it).
function buildAndExpectNoCjsRequire(dir: string): void {
  execFileSync("node", [viteBin(dir), "build"], {
    cwd: dir,
    stdio: "pipe",
    timeout: 60000,
    killSignal: "SIGKILL",
    env: { ...process.env, CI: "false" },
  });
  expect(readFileSync(path.join(dir, "dist", "main.js"), "utf8")).not.toMatch(CJS_REQUIRE_SHIM);
}

let running: Launched | undefined;
afterEach(() => {
  running?.kill();
  running = undefined;
});

for (const ex of RUNNABLE) {
  test(`${ex.name}: dev server (vite) launches and paints a frame`, async () => {
    running = launch("node", [viteBin(ex.dir)], ex.dir);
    await running.waitForRenderOrCrash(TITLE_TOKEN);
    expect(running.output()).not.toMatch(CJS_REQUIRE_SHIM);
  });

  test(`${ex.name}: production build runs (node dist/main.js) and paints a frame`, async () => {
    buildAndExpectNoCjsRequire(ex.dir);
    running = launch("node", ["dist/main.js"], ex.dir);
    await running.waitForRenderOrCrash(TITLE_TOKEN);
  });
}

// coding-agent shares the @vue-tui/vite build path but needs an API key to run, so we can't paint
// it in CI. The build itself is key-free, so we still lock the #212 invariant where it matters.
test("coding-agent: production build succeeds with no bundled CJS require (#212)", () => {
  buildAndExpectNoCjsRequire(exampleDir("coding-agent"));
});

// flappy-bird builds a SELF-CONTAINED dist/game.mjs (everything bundled but Node builtins; the
// stepping stone toward a distributable binary). Guard the property that actually matters — the
// single file runs with NO node_modules — by building it, copying ONLY game.mjs into a fresh temp
// dir, and launching it there. Running from the example's own dir (like the apps above) couldn't
// catch a regression that re-externalized a dep: those deps are still present in node_modules. Here
// a re-externalized dep is ERR_MODULE_NOT_FOUND in the empty sandbox, and dropping platform:"node"
// brings back the throwing require shim — both are launch-failure signatures, so this goes red fast.
test("flappy-bird: self-contained game.mjs runs with no node_modules", async () => {
  const dir = exampleDir("flappy-bird");
  execFileSync("node", [viteBin(dir), "build"], {
    cwd: dir,
    stdio: "pipe",
    timeout: 60000,
    killSignal: "SIGKILL",
    env: { ...process.env, CI: "false" },
  });
  const bundlePath = path.join(dir, "dist", "game.mjs");
  expect(readFileSync(bundlePath, "utf8")).not.toMatch(CJS_REQUIRE_SHIM);

  // Isolate the bundle from the workspace: a dir with the single file and no node_modules at all.
  const sandbox = mkdtempSync(path.join(tmpdir(), "flappy-selfcontained-"));
  try {
    copyFileSync(bundlePath, path.join(sandbox, "game.mjs"));
    running = launch("node", ["game.mjs"], sandbox);
    await running.waitForRenderOrCrash("press space to start");
  } finally {
    running?.kill();
    running = undefined;
    rmSync(sandbox, { recursive: true, force: true });
  }
});
