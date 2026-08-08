import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect, afterEach } from "vite-plus/test";
import { exampleDir, launch, viteBin, type Launched } from "./helpers/run-example.ts";

// End-to-end production smoke for the shipped examples (#212). Every example builds into ONE Node
// file (dist/*.mjs). The deterministic examples also run with NO node_modules present. The 0.1.0
// crash — `Calling \`require\` for "node:module" in an environment that doesn't expose \`require\``
// — came from folding a CJS dependency's require() into an ESM bundle. Every Vite bundle must remain
// free of that throwing shim. Development journeys live in tests/vite.
//
// Why a real PTY: a TUI paints live frames only on a TTY surface (a piped/non-TTY
// child is the final-stream document host), so a non-PTY smoke test would be a
// false negative. Each runnable example is launched under a pseudo-terminal and
// we wait for its title to paint.
//
// A dep that failed to bundle is ERR_MODULE_NOT_FOUND in the empty sandbox; a CJS require that
// survived into the ESM bundle (the #212 fault class) throws the shim at startup. Both are launch
// failures, so this goes red fast.

// Both the template and JSX apps title themselves "vue-tui basic (…)". Letters-only this is
// "vuetuibasic", which the wrap-robust matcher in run-example.ts finds regardless of where the
// box's `width="20"` wraps the title. NB: basic-template must keep `flexDirection="column"` — the
// default row layout interleaves its sibling Texts column-by-column and breaks this contiguous
// token (the test then fails via timeout), so that prop is load-bearing here, not cosmetic.
const TITLE_TOKEN = "vue-tui basic";

// The fingerprint #212 leaves in a built bundle: rolldown couldn't externalize a CJS `require`, so
// it emitted the runtime shim that throws on call. Asserting the bundle is free of this is a fast,
// deterministic #212 guard that needs no PTY and no API key, including for examples we do not run.
const CJS_REQUIRE_SHIM = /doesn't expose the `require` function|Calling `require` for/;

// Build an example with its Vite config and assert it produced exactly the intended bundle with no
// #212 shim — the single home for that invariant, shared by runnable apps and build-only guards.
// Vite needs no TTY; execFileSync blocks synchronously
// (vitest's testTimeout can't preempt it), so it is bounded. Returns the bundle path.
function buildSingleBundle(dir: string, outName: string): string {
  execFileSync("node", [viteBin(dir), "build"], {
    cwd: dir,
    stdio: "pipe",
    timeout: 60000,
    killSignal: "SIGKILL",
  });
  expect(readdirSync(path.join(dir, "dist")).sort()).toEqual([outName]);
  const bundle = path.join(dir, "dist", outName);
  expect(readFileSync(bundle, "utf8")).not.toMatch(CJS_REQUIRE_SHIM);
  return bundle;
}

let running: Launched | undefined;
afterEach(async () => {
  await running?.dispose();
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
    await running?.dispose();
    running = undefined;
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// Deterministic, key-free apps get the self-contained-build launch check.
const SELF_CONTAINED_EXAMPLES = [
  { name: "basic-template", dir: exampleDir("basic-template"), token: TITLE_TOKEN },
  { name: "basic-jsx", dir: exampleDir("basic-jsx"), token: TITLE_TOKEN },
  { name: "scroll-box", dir: exampleDir("scroll-box"), token: "ScrollBox demo" },
] as const;

for (const ex of SELF_CONTAINED_EXAMPLES) {
  test(`${ex.name}: self-contained build (dist/main.mjs) runs with no node_modules`, async () => {
    const bundle = buildSingleBundle(ex.dir, "main.mjs");
    await expectSelfContainedPaints(bundle, ex.token);
  });
}

// The development suite already launches coding-agent's idle prompt. Its OpenAI client is not
// created until the user submits a prompt, so another idle launch cannot prove which SDK runtime
// was selected. Keep the production check at the bundle boundary without requiring a live API key.
test("coding-agent: Vite build produces one bundle without the CJS require shim (#212)", () => {
  buildSingleBundle(exampleDir("coding-agent"), "main.mjs");
});

// flappy-bird uses a different output name but follows the same standalone launch check.
test("flappy-bird: self-contained game.mjs runs with no node_modules", async () => {
  const bundle = buildSingleBundle(exampleDir("flappy-bird"), "game.mjs");
  await expectSelfContainedPaints(bundle, "press space to start");
});
