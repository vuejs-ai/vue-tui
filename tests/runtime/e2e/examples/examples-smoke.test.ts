import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect, afterEach } from "vite-plus/test";
import { exampleDir, launch, viteBin, type Launched } from "./helpers/run-example.ts";

// End-to-end production smoke for the shipped examples (#212). Vite bundles each app into ONE
// self-contained Node file (dist/*.mjs), which `node` runs with NO node_modules present. The 0.1.0
// crash — `Calling \`require\` for "node:module" in an environment that doesn't expose \`require\``
// — came from folding a CJS dependency's require() into an ESM bundle. Building through Vite's
// Node environment must remain free of that throwing shim. Development journeys live in tests/vite.
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
// deterministic #212 guard that needs no PTY and no API key — usable even for examples we can't run.
const CJS_REQUIRE_SHIM = /doesn't expose the `require` function|Calling `require` for/;

// Build an example with its Vite config and assert it produced exactly the intended bundle with no
// #212 shim — the single home for that invariant, shared by the runnable apps (before they launch)
// and the build-only coding-agent guard. Vite needs no TTY; execFileSync blocks synchronously
// (vitest's testTimeout can't preempt it), so it is bounded. Returns the bundle path.
function buildSelfContained(dir: string, outName: string): string {
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
    const bundle = buildSelfContained(ex.dir, "main.mjs");
    await expectSelfContainedPaints(bundle, ex.token);
  });
}

// coding-agent needs a live LLM key only after the user submits a prompt. Its initial dev screen
// above is safe with a fake key; the production build stays a key-free static bundle check because
// launching it would add no coverage beyond the same idle screen.
test("coding-agent: self-contained build succeeds with no bundled CJS require (#212)", () => {
  buildSelfContained(exampleDir("coding-agent"), "main.mjs");
});

// flappy-bird builds a self-contained dist/game.mjs and runs standalone, same as the pair above.
test("flappy-bird: self-contained game.mjs runs with no node_modules", async () => {
  const bundle = buildSelfContained(exampleDir("flappy-bird"), "game.mjs");
  await expectSelfContainedPaints(bundle, "press space to start");
});
