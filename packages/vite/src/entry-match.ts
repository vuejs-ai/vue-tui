import path from "node:path";

/**
 * Resolve the configured dev entry to a single absolute filesystem path for exact
 * module-id matching. `entry` is already in the form produced by `normalizeDevEntry`
 * (root-relative `/src/...`, POSIX absolute, Windows drive, or UNC).
 */
export function resolveConfiguredEntry(root: string, entry: string): string {
  const normalizedRoot = path.resolve(root);
  const e = entry.replace(/\\/g, "/");

  if (/^[a-zA-Z]:\//.test(e) || e.startsWith("//")) {
    return path.resolve(e);
  }

  const rootPosix = normalizedRoot.replace(/\\/g, "/");
  // True filesystem absolute under (or equal to) the Vite root — keep as absolute.
  if (e === rootPosix || e.startsWith(`${rootPosix}/`)) {
    return path.resolve(e);
  }

  // Vite root-relative form (`/src/main.ts`) or any other non-drive rooted path:
  // resolve against the project root, not via endsWith suffix matching.
  return path.resolve(normalizedRoot, e.replace(/^\//, ""));
}

/** Strip Vite query suffixes (`?vue&type=script`) before comparing paths. */
export function stripModuleIdQuery(id: string): string {
  const q = id.indexOf("?");
  return q === -1 ? id : id.slice(0, q);
}

/**
 * Exact match of a transformed module id against the resolved configured entry.
 * Rejects unrelated files that only share a path suffix.
 */
export function moduleIdMatchesConfiguredEntry(moduleId: string, resolvedEntry: string): boolean {
  const bare = stripModuleIdQuery(moduleId);
  return path.resolve(bare) === path.resolve(resolvedEntry);
}
