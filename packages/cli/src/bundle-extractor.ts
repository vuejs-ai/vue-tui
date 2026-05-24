import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface MemoryFiles {
  files: Map<string, unknown>;
  get(key: string): { source: string | Uint8Array } | undefined;
}

export async function extractBundle(memoryFiles: MemoryFiles, outDir: string): Promise<string> {
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
