import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractBundle, type MemoryFiles } from "./bundle-extractor.ts";

// Build a MemoryFiles whose shape matches what extractBundle expects: a `files`
// Map of keys plus a `get(key)` returning `{ source }`. We pack many files per
// extraction (each non-trivially sized) so a write loop takes long enough that a
// concurrent rm() can land mid-write. One `.js` entry is required or
// extractBundle throws "No JS bundle found".
const FILE_COUNT = 200;
const PAYLOAD = "x".repeat(8 * 1024);

function makeMemoryFiles(): MemoryFiles {
  const files = new Map<string, { source: string }>();
  files.set("entry.js", { source: "// entry bundle\n" });
  for (let i = 0; i < FILE_COUNT; i++) {
    // Nest under a subdir so the per-key mkdir(dirname) also races the rm.
    files.set(`assets/chunk-${i}.txt`, { source: `chunk ${i}\n${PAYLOAD}` });
  }
  return {
    files,
    get(key: string) {
      return files.get(key);
    },
  };
}

const expectedKeys = [...makeMemoryFiles().files.keys()];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let outDir: string;

beforeEach(async () => {
  outDir = join(await mkdtemp(join(tmpdir(), "vue-tui-extract-")), "out");
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

test("staggered concurrent extractBundle calls against the same outDir do not race", async () => {
  // The two dev.ts callers (the vue-tui:request-reload handler + the 500ms
  // crash-respawn interval) fire at independent times, so a fresh extractBundle
  // can begin while a prior one is mid-write. Each call starts by rm()-ing the
  // shared outDir then mkdir + writeFile into it; if a second call's rm lands
  // during the first call's write loop it deletes the tree mid-write ->
  // ENOENT/EINVAL/ENOTEMPTY, or leaves a torn (partially populated) dir.
  //
  // We *stagger* the kickoffs (not a simultaneous Promise.all) precisely because
  // simultaneous starts march through rm/mkdir in lockstep and rarely interleave
  // an rm with an in-flight write — staggering is what reproduces the real bug.
  const CALLS = 20;
  const STAGGER_MS = 2;

  const tasks: Promise<string>[] = [];
  for (let i = 0; i < CALLS; i++) {
    tasks.push(extractBundle(makeMemoryFiles(), outDir));
    await sleep(STAGGER_MS);
  }

  const results = await Promise.allSettled(tasks);

  const rejected = results.filter((r) => r.status === "rejected");
  expect(
    rejected.map((r) => (r as PromiseRejectedResult).reason?.message),
    "no extractBundle call should reject",
  ).toEqual([]);

  // After everything settles the dir must hold the COMPLETE file set, not a
  // torn subset left behind by an interleaved rm.
  for (const key of expectedKeys) {
    const content = await readFile(join(outDir, key), "utf8");
    expect(content.length, `missing or empty file: ${key}`).toBeGreaterThan(0);
  }
});
