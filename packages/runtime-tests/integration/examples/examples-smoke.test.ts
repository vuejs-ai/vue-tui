import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect, afterEach } from "vite-plus/test";
import { exampleDir, launch, tsdownBin, viteBin, type Launched } from "./helpers/run-example.ts";

// End-to-end smoke test for the shipped examples (#212). vue-tui splits its two jobs across two
// tools: DEV runs in-process through Vite + @vue-tui/vite (HMR); the production BUILD is a plain
// tsdown config that bundles the whole app into ONE self-contained Node file (dist/*.mjs) which
// `node` runs with NO node_modules present. The 0.1.0 crash — `Calling \`require\` for "node:module"
// in an environment that doesn't expose \`require\`` — came from folding a CJS dep's require() into
// an ESM bundle; tsdown's `platform: "node"` emits a real createRequire instead of that throwing
// shim. This suite guards that the shipped examples still launch and paint on both paths, so a
// regression that reintroduces a module-system crash fails CI on every change.
//
// Why a real PTY: a TUI gates live painting on a TTY (`liveUpdates = !isInCi && isTTY` by default),
// so a piped/non-TTY child renders nothing — a non-PTY smoke test would be a false negative. Each
// runnable example is launched under a pseudo-terminal and we wait for its title to paint.
//
// What each path guards (be precise, don't oversell):
//   - dev (`vite`): the in-process dev server boots and paints — the dev plugin itself
//     (client-compile, CLI-shortcut neutralization, HMR bridge, blank paint). In THIS monorepo the
//     dev path bundles @vue-tui/runtime (the workspace symlink's real path is outside node_modules),
//     so it can't reproduce #212's module-system crash — that's the build path's job.
//   - build (`node dist/*.mjs` from an EMPTY sandbox): the tsdown bundle is self-contained, so this
//     is the standalone-launch guard. A dep that failed to bundle is ERR_MODULE_NOT_FOUND in the
//     empty sandbox; a CJS require that survived into the ESM bundle (the #212 fault class) throws
//     the shim at startup — both are launch failures, so this goes red fast.

// Both the template and JSX apps title themselves "vue-tui basic (…)". Letters-only this is
// "vuetuibasic", which the wrap-robust matcher in run-example.ts finds regardless of where the
// box's `width="20"` wraps the title. NB: basic-template must keep `flexDirection="column"` — the
// default row layout interleaves its sibling Texts column-by-column and breaks this contiguous
// token (the test then fails via timeout), so that prop is load-bearing here, not cosmetic.
const TITLE_TOKEN = "vue-tui basic";

// The fingerprint #212 leaves in a built bundle: rolldown couldn't externalize a CJS `require`, so
// it emitted the runtime shim that throws on call. Asserting the bundle is free of this is a fast,
// deterministic #212 guard that needs no PTY and no API key — usable even for examples we can't run.
const CJS_REQUIRE_SHIM = /doesn't expose the `require` function|Calling `require` for/;

// Build an example with its tsdown config and assert the bundle carries no #212 shim — the single
// home for that invariant, shared by the runnable apps (before they launch) and the build-only
// coding-agent guard. tsdown needs no TTY; execFileSync blocks synchronously (vitest's testTimeout
// can't preempt it), so it's bounded. Returns the bundle path.
function buildSelfContained(dir: string, outName: string): string {
  execFileSync("node", [tsdownBin(dir)], {
    cwd: dir,
    stdio: "pipe",
    timeout: 60000,
    killSignal: "SIGKILL",
    env: { ...process.env, CI: "false" },
  });
  const bundle = path.join(dir, "dist", outName);
  expect(readFileSync(bundle, "utf8")).not.toMatch(CJS_REQUIRE_SHIM);
  return bundle;
}

let running: Launched | undefined;
afterEach(() => {
  running?.kill();
  running = undefined;
});

// Launch a self-contained bundle from a fresh dir holding ONLY that file and NO node_modules — the
// property that actually matters (the single file runs standalone). Running from the example's own
// dir couldn't catch a re-externalized dep (still present in its node_modules); an empty sandbox can.
async function expectSelfContainedPaints(bundle: string, token: string): Promise<void> {
  const sandbox = mkdtempSync(path.join(tmpdir(), "vue-tui-selfcontained-"));
  try {
    const name = path.basename(bundle);
    copyFileSync(bundle, path.join(sandbox, name));
    running = launch("node", [name], sandbox);
    await running.waitForRenderOrCrash(token);
  } finally {
    running?.kill();
    running = undefined;
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// The two deterministic, key-free "hello world" apps get the full dev + self-contained-build check.
const RUNNABLE = [
  { name: "basic-template", dir: exampleDir("basic-template") },
  { name: "basic-jsx", dir: exampleDir("basic-jsx") },
] as const;

for (const ex of RUNNABLE) {
  test(`${ex.name}: dev server (vite) launches and paints a frame`, async () => {
    running = launch("node", [viteBin(ex.dir)], ex.dir);
    await running.waitForRenderOrCrash(TITLE_TOKEN);
    expect(running.output()).not.toMatch(CJS_REQUIRE_SHIM);
  });

  test(`${ex.name}: self-contained build (dist/main.mjs) runs with no node_modules`, async () => {
    const bundle = buildSelfContained(ex.dir, "main.mjs");
    await expectSelfContainedPaints(bundle, TITLE_TOKEN);
  });
}

// coding-agent shares the same tsdown build but needs a live LLM key to RUN, so we can't paint it in
// CI. The build itself is key-free, so we still lock the #212 invariant where it matters.
test("coding-agent: self-contained build succeeds with no bundled CJS require (#212)", () => {
  buildSelfContained(exampleDir("coding-agent"), "main.mjs");
});

// flappy-bird builds a self-contained dist/game.mjs and runs standalone, same as the pair above.
test("flappy-bird: self-contained game.mjs runs with no node_modules", async () => {
  const bundle = buildSelfContained(exampleDir("flappy-bird"), "game.mjs");
  await expectSelfContainedPaints(bundle, "press space to start");
});
