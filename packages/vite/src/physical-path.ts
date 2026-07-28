import { realpathSync } from "node:fs";
import path from "node:path";

/** Resolve an existing path through filesystem links, with a stable missing-path fallback. */
export function resolvePhysicalPath(value: string): string {
  const resolved = path.resolve(value);
  try {
    return realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}
