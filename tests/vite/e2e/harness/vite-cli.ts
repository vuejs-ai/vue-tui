import { createRequire } from "node:module";
import path from "node:path";

// Vite's `exports` does not expose ./bin/vite.js, so resolve its package.json and
// read the `bin` field instead. The per-example Runtime harness has its own copy;
// sharing them across two test workspaces would mean a package for eleven lines
// that only change if Vite changes its package layout.
export function resolveViteBin(from: string | URL = import.meta.url): string {
  const require = createRequire(from);
  const packagePath = require.resolve("vite/package.json");
  const pkg = require(packagePath) as { bin?: string | Record<string, string> };
  const relative = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.vite;
  if (relative === undefined) {
    throw new Error(`Could not locate Vite's CLI entry from ${packagePath}`);
  }
  return path.join(path.dirname(packagePath), relative);
}
