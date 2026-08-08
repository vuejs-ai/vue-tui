# Changelog

All notable changes to `@vue-tui/vite` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/). While on
`0.x`, minor versions may include breaking changes.

## Unreleased

### Changed

- **Vite-only application builds** — the standalone starter and examples now declare their only entry with Vite 8.2's top-level `input` and use a regular Vite application build targeting Node, while `vueTui()` remains development-only and embedded Runtime applications keep ownership of their host build.
- **Breaking: one Vite entry** — `vueTui({ entry })` is replaced by `vueTui()`, which reads Vite's top-level `input`; the plugin rejects multiple development entries because one terminal session launches one app process.
- **Vite compatibility** — the exact tested Vite pin moves from 8.1.0 to 8.2.1.

## 0.3.0 - 2026-08-02

Measured against the published `0.2.0`.

### Changed

- **Breaking: SFC development compiler** — SFC projects now use `unplugin-vue/vite`, whose supported `ssr: false` default emits client render functions for the terminal renderer. `@vitejs/plugin-vue` is no longer supported by `vueTui()`; JSX development continues to use `@vitejs/plugin-vue-jsx`.
- **Breaking: dev-only** — the plugin no longer configures production builds. `vueTui()` returns just the dev plugins; the build-config plugin and externalization predicate are gone. Applications build with `tsdown` plus `unplugin-vue`.
- **Client compiler compatibility** — Vite and the SFC/JSX compiler peers are pinned to the exact versions exercised by the suite. An explicit `unplugin-vue({ ssr: true })` configuration and known unsupported compiler integrations fail with `VueTuiUnsupportedCompilerError`; generated output is not scanned, so legal helper-like user text remains valid.
- **Failed HMR updates** — an SSR source preflight plus Vite's runner logger and a delegated evaluator forward compile and evaluation diagnostics to the live overlay. Every registered accept callback is guarded at Vite's per-update runner seam, while a missing runner seam and conflicting SSR environment factories fail by name.
- **Entry paths and linked roots** — root-relative entries and existing absolute entries outside the Vite root resolve with Vite's own path semantics. Entry injection and `file-changed` forwarding compare physical paths by default, while `resolve.preserveSymlinks: true` retains linked spellings end to end.
- **App exit** — signalled over the hot channel instead of a process-global.
- **Runtime access** — only through `@vue-tui/runtime/internal/devtools`; the public-looking `/devtools` path is absent.
