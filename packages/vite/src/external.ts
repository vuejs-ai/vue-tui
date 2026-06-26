// Externalize bare imports (resolved from node_modules at runtime by Node) but KEEP
// in the bundle: relative/absolute ids, Rollup virtual ids ("\0..."), and our
// "virtual:" ids (they have no on-disk file — externalizing them would crash at runtime).
export function isExternalId(id: string): boolean {
  return !id.startsWith("\0") && !id.startsWith("virtual:") && !/^[./]/.test(id);
}
