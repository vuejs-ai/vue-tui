import { posix, win32 } from "node:path";

// Externalize bare imports (resolved from node_modules at runtime by Node) but KEEP
// in the bundle: relative imports, ABSOLUTE paths, Rollup virtual ids ("\0..."), and
// our "virtual:" ids (no on-disk file — externalizing them would crash at runtime).
//
// @vitejs/plugin-vue resolves the SFC to an ABSOLUTE path before this runs, so absolute
// paths must count as internal. We test BOTH posix.isAbsolute AND win32.isAbsolute, not a
// bare `/`-prefix check: on Windows the SFC resolves to a drive-letter path like
// `D:\app\src\App.vue` (or `D:/…`, or a `\\server\share` UNC path) that a POSIX-only `/`
// check misses — which left the .vue file external and crashed `node dist/main.js` with
// ERR_MODULE_NOT_FOUND on Windows (vue-tui#209, ported from the now-removed CLI's fix).
export function isExternalId(id: string): boolean {
  if (id.startsWith("\0") || id.startsWith("virtual:")) return false;
  if (id.startsWith(".")) return false;
  if (posix.isAbsolute(id) || win32.isAbsolute(id)) return false;
  return true;
}
