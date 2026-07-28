import { existsSync } from "node:fs";
import path from "node:path";
import { resolvePhysicalPath } from "./physical-path.ts";

const DEFAULT_DEV_ENTRY = "src/main.ts";

/**
 * Normalize the dev entry for the SSR runner import id and for later absolute
 * resolution against config.root. Anything already ROOTED passes through
 * unchanged — a leading "/" (Vite root-relative "/src/main.ts" or a POSIX
 * filesystem path), a UNC "//server/share/…", or a Windows drive-letter
 * "C:/x". Vite resolves the ambiguous POSIX form by preferring an existing
 * absolute file and otherwise treating it as root-relative; config resolution
 * below mirrors that rule. Only the RELATIVE forms ("src/main.ts",
 * "./src/main.ts") get a leading slash added. Backslashes are normalized first.
 *
 * Lives here rather than beside its caller because `devPlugin` needs the same
 * default, and spelling it twice meant one decision in two coordinate systems
 * ("src/main.ts" before normalization, "/src/main.ts" after) that had to stay in
 * sync by hand.
 */
export function normalizeDevEntry(entry?: string): string {
  const e = (entry ?? DEFAULT_DEV_ENTRY).replace(/\\/g, "/");
  if (e.startsWith("/") || /^[a-zA-Z]:\//.test(e)) return e;
  return `/${e.replace(/^(?:\.\/)+/, "")}`;
}

/**
 * Resolve the configured dev entry to a single absolute filesystem path for exact
 * module-id matching. `entry` is already in the form produced by `normalizeDevEntry`
 * (root-relative `/src/...`, POSIX absolute, Windows drive, or UNC). A leading
 * slash is ambiguous by design in Vite: an existing absolute file wins, while a
 * missing one is interpreted against the project root.
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

  // Vite's resolver accepts an existing absolute file outside config.root. Its
  // module runner imports the original id, so transform matching must make the
  // same choice rather than silently reinterpreting that file as root-relative.
  if (path.isAbsolute(e) && existsSync(e)) return path.resolve(e);

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
export function moduleIdMatchesConfiguredEntry(
  moduleId: string,
  resolvedEntry: string,
  preserveSymlinks = false,
): boolean {
  const bare = stripModuleIdQuery(moduleId);
  if (preserveSymlinks) {
    // Vite deliberately keeps linked module ids in this mode. Realpathing here
    // would make two spellings match even though the rest of Vite treats them as
    // distinct modules.
    return path.resolve(bare) === path.resolve(resolvedEntry);
  }
  // Vite resolves module ids through the filesystem. The configured root can
  // still use an equivalent symlink spelling (`/var` versus `/private/var` on
  // macOS), so string-only absolute paths miss the real entry and silently skip
  // the dev connector. Missing/fake paths retain a deterministic fallback.
  return resolvePhysicalPath(bare) === resolvePhysicalPath(resolvedEntry);
}
