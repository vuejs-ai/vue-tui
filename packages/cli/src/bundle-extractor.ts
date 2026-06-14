import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface MemoryFiles {
  files: Map<string, unknown>;
  get(key: string): { source: string | Uint8Array } | undefined;
}

// Serialize extractions through a single in-flight promise chain.
//
// WHY: extractBundle wipes (rm) then repopulates (mkdir + writeFile) the shared
// outDir in place. dev.ts invokes it from two UNSYNCHRONIZED callers — the
// `vue-tui:request-reload` hot handler and the 500ms crash-respawn interval —
// that can fire at independent times. If a second call's rm() lands while a
// first call is mid-writeFile, it deletes the tree out from under the first
// (ENOENT/EINVAL/ENOTEMPTY), or leaves a torn, partially-populated dir that the
// child then loads. Chaining each run after the previous one guarantees at most
// one extraction touches outDir at a time, so concurrent callers queue instead
// of racing. (Confining the fix here keeps dev.ts untouched.)
let pending: Promise<unknown> = Promise.resolve();

export function extractBundle(memoryFiles: MemoryFiles, outDir: string): Promise<string> {
  const run = pending.then(() => doExtract(memoryFiles, outDir));
  // Keep the chain alive even if a run rejects: swallow errors on the internal
  // `pending` so one failed extraction doesn't permanently wedge the queue. The
  // caller still receives the real result/rejection via `run` (dev.ts's own
  // try/catch handles it).
  pending = run.catch(() => {});
  return run;
}

async function doExtract(memoryFiles: MemoryFiles, outDir: string): Promise<string> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const keys = [...memoryFiles.files.keys()];
  let entryPath: string | undefined;

  for (const key of keys) {
    const file = memoryFiles.get(key);
    if (!file) continue;

    const outPath = join(outDir, key);
    await mkdir(dirname(outPath), { recursive: true });

    const source = typeof file.source === "string" ? file.source : Buffer.from(file.source);
    await writeFile(outPath, source);

    if (key.endsWith(".js") && !key.endsWith(".js.map")) {
      entryPath ??= outPath;
    }
  }

  if (!entryPath) {
    throw new Error("No JS bundle found in Vite memoryFiles");
  }
  return entryPath;
}
