# Changelog

All notable changes to `@vue-tui/vite` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/). While on
`0.x`, minor versions may include breaking changes.

## 0.2.0 - 2026-06-28

### Breaking

- **`vueTui()` no longer bundles `@vitejs/plugin-vue`.** Add your SFC/JSX
  compiler explicitly, compiler first:

  ```diff
   import { defineConfig } from "vite";
  +import vue from "@vitejs/plugin-vue";
   import { vueTui } from "@vue-tui/vite";

   export default defineConfig({
  -  plugins: [vueTui()],
  +  plugins: [vue(), vueTui()],
   });
  ```

  JSX projects use `@vitejs/plugin-vue-jsx` instead: `plugins: [vueJsx(), vueTui()]`.
  `@vitejs/plugin-vue` moved from a dependency to an **optional peer dependency** —
  install it (or `@vitejs/plugin-vue-jsx`) yourself. The `vueTui({ vue })`
  passthrough option is removed; configure `vue()` directly.

  Why: the authoring format (SFC vs JSX) is the app author's choice, so the
  compiler stays explicit and consistent (JSX already was), matching the usual
  Vite convention of listing your framework plugin in `plugins`.

## 0.1.2 - 2026-06-28

### Fixed

- Ship TypeScript declarations (`dist/index.d.mts`) plus a `types` export
  condition. Previously `vueTui()` resolved to `any` for TypeScript consumers.

## 0.1.1 - 2026-06-28

First publish of `@vue-tui/vite` — the in-process terminal dev server (HMR) and
production build for [vue-tui](https://github.com/vuejs-ai/vue-tui) apps. Add
`vueTui()` to `vite.config.ts`: `vite` (dev) runs the app in-process with
state-preserving HMR, and `vite build` emits a single Node entry.
