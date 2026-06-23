import { posix, win32 } from "node:path";

/**
 * Rollup/Rolldown `external` predicate for building a vue-tui app into a single
 * Node ESM bundle with `vite build`.
 *
 * The intent: bundle everything that belongs to the app's own source —
 * relative imports, the `.vue` SFC and its `?vue` virtual sub-modules, and any
 * `\0`-prefixed virtual module — while leaving bare specifiers (`vue`,
 * `@vue-tui/runtime`, `node:fs`, …) external so Node resolves them from
 * `node_modules` at startup.
 *
 * `@vitejs/plugin-vue` resolves the SFC to an *absolute* path before this
 * predicate runs, so absolute paths must count as "internal". We deliberately
 * test BOTH `posix` and `win32` absolute forms rather than `path.isAbsolute`
 * (the platform default) or a bare `id.startsWith("/")`: on Windows the SFC
 * resolves to a drive-letter path like `D:\app\src\App.vue` (or `D:/…`, or a
 * `\\server\share\…` UNC path) that a POSIX-only `/` check misses — which left
 * the `.vue` file marked external and broke `node dist/app.mjs` with
 * ERR_MODULE_NOT_FOUND (vue-tui#209). Checking both schemes is correct on every
 * host and lets the regression test cover the Windows case from Linux/macOS CI.
 *
 * Usage in a project's `vite.config.ts`:
 *
 * ```ts
 * import { external } from "@vue-tui/cli/vite";
 *
 * export default defineConfig({
 *   plugins: [vue()],
 *   build: { lib: { ... }, rollupOptions: { external } },
 * });
 * ```
 */
export function external(id: string): boolean {
  if (id.startsWith(".") || id.startsWith("\0")) return false;
  if (posix.isAbsolute(id) || win32.isAbsolute(id)) return false;
  return true;
}
